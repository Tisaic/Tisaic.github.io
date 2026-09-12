/**
 * @file NOT A TEST — WHAT DOES A CORRECTION ACTUALLY DO TO EACH PLANT? The cheapest
 * instrument that can explain why the method wins on some plants and harms others.
 *
 * THE DATUM THAT MOTIVATES IT. On BOTH standing refusals the record says the forecast was
 * GOOD and the correction was still harmful. Wood-Berry with `mimo` armed reaches R²
 * 0.986/0.993 and delivers 52.52 against doing nothing's 43.90; the barrel was swept over a
 * sixteen-fold range of believed gain WITH THE FORECAST HELD FIXED AND GOOD and every setting
 * that applied a real correction was worse than nothing, the best row reaching 1.017x by making
 * the correction VANISH. A good model and a harmful correction, on two plants sharing no
 * physics, is rule 18 pointing at the code rather than at either plant.
 *
 * WHAT IT MEASURES, and it is not a model of anything. Each plant is run TWICE from the same
 * `fresh()` — once undriven, once with a correction HELD on one channel — and the two truth
 * records are subtracted. What is left is the plant's own response to a correction, obtained
 * without the pilot, without a fit and without a probe design (rule 15: a route that does not
 * share the mistake). The seeded rigs make this exact rather than statistical: `makeMill(1)`
 * and `makeBarrel(7)` seed their own noise, so two `fresh()` calls replay the SAME noise and
 * the subtraction cancels it to the last bit instead of averaging it away.
 *
 * THE FOUR DIAGNOSTICS, each chosen because it names a different way an inversion can fail:
 *
 *   DEAD     steps before the response leaves 2% of its own final value. A horizon shorter
 *            than this inverts a plant that cannot move yet — the mill's own history.
 *   RISE     steps to 90% of final. Against the horizon the pilot builds, this says whether
 *            the QP is optimising over a window in which anything happens.
 *   INVERSE  the largest excursion of OPPOSITE sign to the final value, as a fraction of it.
 *            This is the signature of non-minimum phase: a plant that first goes the wrong
 *            way. Inverting one produces a correction that is right inside the horizon and
 *            wrong after it, which is exactly "good forecast, harmful correction".
 *   RGA      the relative gain array of the steady gain matrix, for the multivariable plants.
 *            The pilot inverts a DIAGONAL; the RGA is the standard statement of how wrong
 *            that pairing is. Wood-Berry is the textbook strongly-interacting 2x2.
 *
 * BOTH HALVES (rule 9). Every response is taken at TWO amplitudes and the instrument reports
 * whether it SCALES. Where it does, the diagnostics are a property of the plant; where it does
 * not — and the barrel radiates as T^4, so it should not — they are local to that amplitude and
 * the file says so rather than quoting them as if they were general.
 *
 * AND IT CARRIES ITS OWN INTERNAL CONTROL. The MILL is the same rig that REFUSES in
 * `plants.test.mjs` and DELIVERS 1.45x in `rollmill.test.mjs`, differing only in whether its
 * transport delay is DECLARED. A diagnostic that separates winners from losers has to explain
 * both of the mill's states, from one measurement, or it is a story fitted to the answer.
 *
 * KNOBS: PLANTS (comma list), AMP (fraction of uMax, default 0.25), WINDOW (steps), K0
 * (fraction of the program at which the step is applied). It asserts nothing.
 */
import { tankSpec, wbSpec, millSpec, barrelSpec } from './rigs/specs.mjs';

const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
const AMP = env('AMP', 0.25);
const K0F = env('K0', 0.10);
const WANT = (process.env.PLANTS || 'tank,column,mill,barrel').split(',');

const SPECS = [['tank', tankSpec], ['column', wbSpec], ['mill', millSpec], ['barrel', barrelSpec]];

/**
 * Run one plant for `n` steps from a fresh state, holding a correction `amp` on channel `j`
 * from step `k0`. Returns the truth record per channel. `j < 0` is the undriven baseline.
 */
function drive(spec, n, k0, j, amp) {
  const st = spec.fresh();
  const nc = spec.channels.length;
  const out = Array.from({ length: nc }, () => new Float64Array(n));
  const u = new Array(nc).fill(0);
  // THE REFERENCE IS FROZEN AT THE STEP POINT, and the first version of this file did not do
  // that. Letting the program run underneath looked harmless because the paired subtraction
  // removes the program's own response — but only on a LINEAR plant. The tank's outflow goes as
  // sqrt(level) and the barrel radiates as T^4, so the response to a correction depends on the
  // operating point the program has moved to, and the difference of two runs is then a moving
  // target rather than a response. It showed as a tail that never settled (rules 12, 13). The
  // plant still REACHES k0 through its own program; only after that is the reference held.
  const hold = spec.refAt(k0);
  for (let k = 0; k < n; k++) {
    for (let c = 0; c < nc; c++) u[c] = (j >= 0 && c === j && k >= k0) ? amp : 0;
    const r = spec.step(st, k < k0 ? spec.refAt(k) : hold, u, k);
    for (let c = 0; c < nc; c++) out[c][k] = r.truth[c];
  }
  return out;
}

/** The four shape diagnostics of one response, measured from the step at `k0`. */
function shape(resp, k0) {
  const n = resp.length;
  const tail = Math.max(1, Math.round((n - k0) * 0.05));
  let fin = 0;
  for (let i = n - tail; i < n; i++) fin += resp[i];
  fin /= tail;                                    // final value, averaged over the last 5%
  // SETTLED? The last 5% against the 5% before it. A response still moving makes every
  // number below a description of a transient (rules 12, 13), so it is reported not hidden.
  let prev = 0;
  for (let i = n - 2 * tail; i < n - tail; i++) prev += resp[i];
  prev /= tail;
  const settled = Math.abs(fin) < 1e-300 ? true : Math.abs(fin - prev) / Math.abs(fin) < 0.02;
  let pk = 0, inv = 0;
  for (let i = k0; i < n; i++) {
    if (Math.abs(resp[i]) > Math.abs(pk)) pk = resp[i];
    // opposite sign to the final value = going the wrong way first
    if (fin !== 0 && Math.sign(resp[i]) === -Math.sign(fin) && Math.abs(resp[i]) > Math.abs(inv)) inv = resp[i];
  }
  let dead = 0;
  while (k0 + dead < n && Math.abs(resp[k0 + dead]) < 0.02 * Math.abs(fin)) dead++;
  let rise = dead;
  while (k0 + rise < n && Math.abs(resp[k0 + rise]) < 0.90 * Math.abs(fin)) rise++;
  // WHAT A PROBE THAT STOPS EARLY WOULD REPORT, as a fraction of the true DC gain. The record
  // says the barrel's probe halts at 16,400 and 30,200 steps and reads its DC 24% and 15% LOW,
  // and a controller told the plant is less responsive than it is will over-correct. This is
  // that quantity by a route with no probe in it: the response itself, truncated.
  const at = (f) => {
    const i = Math.min(n - 1, k0 + Math.round((n - k0) * f));
    return fin === 0 ? 1 : resp[i] / fin;
  };
  return { fin, dead, rise, inv: fin === 0 ? 0 : Math.abs(inv / fin), pk, settled,
    dc25: at(0.25), dc50: at(0.50) };
}

/** Relative gain array of a square matrix: G .* inv(G)'. Null if G is singular. */
function rga(G) {
  const n = G.length;
  const A = G.map((r, i) => [...r, ...Array.from({ length: n }, (_, k) => (k === i ? 1 : 0))]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    if (Math.abs(A[p][i]) < 1e-300) return null;
    [A[i], A[p]] = [A[p], A[i]];
    const d = A[i][i];
    for (let c = 0; c < 2 * n; c++) A[i][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = A[r][i];
      for (let c = 0; c < 2 * n; c++) A[r][c] -= f * A[i][c];
    }
  }
  const inv = A.map((r) => r.slice(n));
  return G.map((r, i) => r.map((g, j) => g * inv[j][i]));
}

const fmt = (v, w, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—').padStart(w);

console.log('\nWHAT A CORRECTION ACTUALLY DOES — plant response to a HELD correction, no pilot,'
  + ' no fit, no probe.\n');
console.log(`  step at ${(K0F * 100).toFixed(0)}% of the program, amplitude ${AMP} of uMax,`
  + ' noise cancelled exactly by the paired run.\n');

const summary = [];
for (const [name, spec] of SPECS) {
  if (!WANT.includes(name)) continue;
  const nc = spec.channels.length;
  const n = Math.min(spec.N, env('WINDOW', spec.N));
  const k0 = Math.round(n * K0F);
  const amp = AMP * spec.uMax;
  const base = drive(spec, n, k0, -1, 0);
  const G = Array.from({ length: nc }, () => new Array(nc).fill(0));
  const rows = [];
  let anyUnsettled = false, worstInv = 0, worstScale = 2, worstDc = 1;   // 2 = perfect scaling
  for (let j = 0; j < nc; j++) {
    const on = drive(spec, n, k0, j, amp);
    const half = drive(spec, n, k0, j, amp / 2);       // the scaling control (rule 9)
    for (let c = 0; c < nc; c++) {
      const resp = new Float64Array(n);
      const respH = new Float64Array(n);
      for (let k = 0; k < n; k++) { resp[k] = on[c][k] - base[c][k]; respH[k] = half[c][k] - base[c][k]; }
      const s = shape(resp, k0), sh = shape(respH, k0);
      G[c][j] = s.fin;
      // Does the response SCALE? Halving the amplitude should halve the final value.
      const scale = Math.abs(sh.fin) < 1e-300 ? NaN : Math.abs(s.fin / sh.fin);
      if (!s.settled) anyUnsettled = true;
      if (Math.abs(scale - 2) > Math.abs(worstScale - 2) && Number.isFinite(scale)) worstScale = scale;
      if (c === j) { worstInv = Math.max(worstInv, s.inv); worstDc = Math.min(worstDc, s.dc25); }
      rows.push({ j, c, ...s, scale });
    }
  }
  console.log(`  ${name}  (${nc} channel${nc > 1 ? 's' : ''}, ${n} steps, uMax ${spec.uMax})`);
  console.log('    u->y     final        dead     rise    INVERSE   scale(x2)   DC@25%  @50%  settled');
  for (const r of rows) {
    console.log(`    ${r.j}->${r.c}  ${r.fin.toExponential(2).padStart(11)}`
      + `${String(r.dead).padStart(9)}${String(r.rise).padStart(9)}`
      + `${(r.inv * 100).toFixed(1).padStart(9)}%${fmt(r.scale, 11, 2)}`
      + `${(r.dc25 * 100).toFixed(0).padStart(8)}%${(r.dc50 * 100).toFixed(0).padStart(7)}%`
      + `   ${r.settled ? 'yes' : 'NO — a transient'}`);
  }
  const R = nc > 1 ? rga(G) : null;
  if (R) {
    console.log(`    RGA diagonal: ${R.map((r, i) => r[i].toFixed(2)).join(', ')}`
      + `   (1.0 = no interaction; far from 1, or NEGATIVE, means the diagonal pairing is wrong)`);
  }
  summary.push({ name, inv: worstInv, dc: worstDc, rga: R ? R.map((r, i) => r[i]) : null,
    dead: Math.max(...rows.filter((r) => r.j === r.c).map((r) => r.dead)),
    rise: Math.max(...rows.filter((r) => r.j === r.c).map((r) => r.rise)),
    unsettled: anyUnsettled, scale: worstScale });
  console.log('');
}

console.log('  SUMMARY — against what the record says, WITH the configuration each number is from:\n');
// THE RECORD COLUMN NAMES ITS CONFIGURATION, because a first draft did not and duly mixed two.
// It quoted the barrel at "0.22x", which is the REPRESENTATIVE-REGIME verify figure from
// `verifyRef` — while in `plants.test.mjs`, the file these specs come from, the barrel DEPLOYS a
// two-layer cascade at 1.05x. Both numbers are real and they are about different questions, and a
// diagnostic table that silently picks the more damning one is choosing its own evidence.
const VERDICT = {
  tank: 'plants.test 10.53x (classic) · tankspread: 4 of 8 seeds HARMED at the old defaults',
  column: 'plants.test REFUSES 1.00x · every deployment of 12 seeds worse than doing nothing',
  mill: 'plants.test REFUSES 1.00x undeclared · rollmill 1.45x on 8 of 8 once DECLARED',
  barrel: 'plants.test DEPLOYS 1.05x (stack 2) · representative regime 0.22x, forced deploy at cap',
};
console.log('    plant    dead     rise  dead/rise  INVERSE  DC@25%   RGA diag        scale  record');
for (const s of summary) {
  console.log(`    ${s.name.padEnd(8)}${String(s.dead).padStart(5)}${String(s.rise).padStart(8)}`
    + `${fmt(s.dead / Math.max(1, s.rise), 11, 2)}${(s.inv * 100).toFixed(1).padStart(8)}%`
    + `${(s.dc * 100).toFixed(0).padStart(7)}%   `
    + `${(s.rga ? s.rga.map((v) => v.toFixed(2)).join('/') : '—').padEnd(14)}`
    + `${fmt(s.scale, 6, 2)}  ${VERDICT[s.name]}`);
}
console.log('\n  A diagnostic is only worth something if it splits the table the way the record does,');
console.log('  AND explains the mill in both of its states from one measurement. Read it that way.\n');
