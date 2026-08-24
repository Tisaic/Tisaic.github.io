/**
 * @file THE SAME PILOT, A PLANT THAT SHARES NOTHING WITH THE ARM.
 *
 * The claim the flagship makes is that route–limit–run–deploy is generic: the algorithm
 * knows nothing about what it is controlling, so swapping the signals should be the
 * whole of the work. This is that claim under test, and it is only worth anything if
 * `lib/pilot/` is UNTOUCHED — no plant hook, no special case, no constant that happens
 * to suit an arm. It imports the same class the Path tab deploys.
 *
 * THE PLANT IS THE QUADRUPLE-TANK PROCESS (Johansson 2000), the standard academic
 * benchmark for multivariable difficulty, and about as far from a compliant robot as a
 * plant gets:
 *   - the state is LIQUID LEVEL and the input is PUMP VOLTAGE — no inertia anywhere, so
 *     the arm's whole vocabulary (wind-up, ringing, backlash) simply does not apply
 *   - it is NONLINEAR by Torricelli: outflow goes as sqrt(h), so the gain falls as a
 *     tank fills and every operating point has a different one
 *   - it is CROSS-COUPLED through the upper tanks. Pump 1 feeds tank 1 directly AND
 *     tank 4, which drains into tank 2, so each input reaches both outputs by two paths
 *     with different time constants
 *   - and the valve split decides its ZERO. With gamma1 + gamma2 > 1 it is minimum
 *     phase; below 1 it is NON-MINIMUM PHASE, and the level first moves the WRONG WAY.
 *     No feedforward inverse can cancel that, and it is included deliberately.
 * Units are centimetres and volts, the timescale is minutes, and the pilot is told none
 * of it.
 *
 * WHAT IS ROUTED — the entire integration:
 *   - FOUR measured signals (the four levels) where the arm routed six
 *   - TWO correction channels (the pump voltages), in volts
 *   - one truth channel per correction: the level error against what that commanded
 *     voltage would hold — the exact analogue of "tool minus forward kinematics"
 *   - limits in volts and volts/step, and a guard on overflow
 * THE UNITS OF TRUTH AND CORRECTION DO NOT MATCH, and they need not: the probe measures
 * d(truth)/d(u) itself, so the conversion lives in a response the pilot measured rather
 * than in anything anybody told it.
 */
import { Pilot } from '../../lib/pilot/pilot.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\npilot: the quadruple-tank process — same algorithm, different signals');

// --------------------------------------------------------------------------- plant
// THE ENGINEER'S CORRECTION CAP, in volts. Sized like any other routed limit: the box
// spans 1.6 V, so a correction of up to 1.2 V is real authority without being absurd for
// a pump. Measured, it matters as much here as on the arm — at 0.35 V the correction
// pins at the cap and the recipe gets WORSE (0.506 → 0.839 cm, i.e. 0.60x).
const UCAP = 1.2;

const G = 981;                            // cm/s^2
const AREA = [28, 32, 28, 32];            // tank cross-sections, cm^2
const AO = [0.071, 0.057, 0.071, 0.057];  // outlet areas, cm^2
const KP = [3.33, 3.35];                  // pump gains, cm^3/(V s)
const DT = 0.1;                           // s per step

function makeTanks(g) {
  const h = [10.7, 10.7, 3.0, 3.0];
  return { h, step(v1, v2) {
    const v = [Math.max(0, v1), Math.max(0, v2)];
    const q = h.map((x, i) => AO[i] * Math.sqrt(2 * G * Math.max(0, x)));
    const d = [
      (-q[0] + q[2] + g[0] * KP[0] * v[0]) / AREA[0],
      (-q[1] + q[3] + g[1] * KP[1] * v[1]) / AREA[1],
      (-q[2] + (1 - g[1]) * KP[1] * v[1]) / AREA[2],
      (-q[3] + (1 - g[0]) * KP[0] * v[0]) / AREA[3],
    ];
    for (let i = 0; i < 4; i++) h[i] = Math.max(0, h[i] + DT * d[i]);
  } };
}
/** Steady levels for a held pair of voltages — the plant's own forward model. */
function levelsAt(g, v1, v2) {
  return [
    (g[0] * KP[0] * v1 + (1 - g[1]) * KP[1] * v2) ** 2 / (AO[0] ** 2 * 2 * G),
    ((1 - g[0]) * KP[0] * v1 + g[1] * KP[1] * v2) ** 2 / (AO[1] ** 2 * 2 * G),
  ];
}
/** The voltages holding a pair of levels — this plant's analogue of inverse kinematics. */
function voltsFor(g, h1, h2) {
  const b1 = AO[0] * Math.sqrt(2 * G * h1), b2 = AO[1] * Math.sqrt(2 * G * h2);
  const a11 = g[0] * KP[0], a12 = (1 - g[1]) * KP[1];
  const a21 = (1 - g[0]) * KP[0], a22 = g[1] * KP[1];
  const det = a11 * a22 - a12 * a21;      // sign flips as gamma1+gamma2 crosses 1
  return [(b1 * a22 - b2 * a12) / det, (b2 * a11 - b1 * a21) / det];
}

// ------------------------------------------------------------------- the program
// A RECIPE, NOT A CONTOUR: hold a level, ramp smoothly to the next, hold again. What a
// process line actually runs, and it shares no shape with a closed toolpath.
const SEG = 4000, HOLD = 1200;
const RECIPE = [[10.7, 10.7], [13.5, 8.8], [8.4, 12.8], [12.2, 11.6], [9.2, 9.6]];
const quintic = (t) => t * t * t * (10 + t * (-15 + 6 * t));
function refAtStep(k) {
  const i = Math.min(RECIPE.length - 2, Math.floor(k / SEG));
  const t = (k - i * SEG - HOLD) / (SEG - HOLD);
  const s = t <= 0 ? 0 : t >= 1 ? 1 : quintic(t);
  const a = RECIPE[i], b = RECIPE[i + 1];
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
}
const PROG = SEG * (RECIPE.length - 1);

// ------------------------------------------------------------ route, limit, run
async function commission(g, dwell, seed = 1) {
  const p = makeTanks(g);
  const start = voltsFor(g, RECIPE[0][0], RECIPE[0][1]);
  for (let i = 0; i < 30000; i++) p.step(start[0], start[1]);
  const pilot = new Pilot({
    nMeasured: 4,
    channels: [0, 1].map(() => ({ lo: 2.0, hi: 3.6,
      vMax: 4e-3, aMax: 2e-5, jMax: 2e-7 })),
    uMax: UCAP,
    start,
    // OVERFLOW IS THE GUARD — the same shape as the arm's torque guard: an index into
    // the routed signals and a number the engineer knows about their own machine.
    guards: [{ index: 0, max: 19 }, { index: 1, max: 19 }],
    workspace: () => true,
    dwell,
    seed,
  });
  let steps = 0;
  while (pilot.phase !== 'done') {
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    p.step(cmd[0].pos + cmd[0].u, cmd[1].pos + cmd[1].u);
    steps++;
    const want = levelsAt(g, cmd[0].pos, cmd[1].pos);
    pilot.observe([p.h[0], p.h[1], p.h[2], p.h[3]],
      [p.h[0] - want[0], p.h[1] - want[1]]);
  }
  return { pilot, steps };
}

function runRecipe(g, pilot, active) {
  const p = makeTanks(g);
  const start = voltsFor(g, RECIPE[0][0], RECIPE[0][1]);
  for (let i = 0; i < 30000; i++) p.step(start[0], start[1]);
  const S = pilot.sample, cache = new Map();
  const refAt = (i) => {
    const k = Math.min(Math.max(i * S, 0), PROG);
    let r = cache.get(k);
    if (!r) { const h = refAtStep(k); r = voltsFor(g, h[0], h[1]); cache.set(k, r); }
    return r;
  };
  if (active) pilot._initRun();
  let s2 = 0, n = 0, uPk = 0, worst = 0;
  for (let k = 0; k < PROG; k++) {
    const href = refAtStep(k);
    const vn = voltsFor(g, href[0], href[1]);
    const u = active ? pilot.act((off) => refAt(Math.floor(k / S) + off)) : [0, 0];
    uPk = Math.max(uPk, Math.abs(u[0]), Math.abs(u[1]));
    p.step(vn[0] + u[0], vn[1] + u[1]);
    pilot.observe([p.h[0], p.h[1], p.h[2], p.h[3]], null);
    if (k > SEG) {                    // skip the first ramp: startup, not control
      s2 += (p.h[0] - href[0]) ** 2 + (p.h[1] - href[1]) ** 2; n += 2;
      worst = Math.max(worst, Math.abs(p.h[0] - href[0]), Math.abs(p.h[1] - href[1]));
    }
  }
  return { rms: Math.sqrt(s2 / n), worst, uPk };
}

// ============================================ THE RUN, AND THE A/B THAT MATTERS
const t0 = Date.now();
const GMP = [0.70, 0.60];

// THE EXCITATION NEVER HOLDS STILL, AND THIS PLANT'S PROGRAM DOES. `dwell` warps the
// excitation's time base so it lingers as well as sweeps; it was measured NULL-TO-
// NEGATIVE on the arm and shipped off, because a toolpath never stops and an excitation
// that dwells is one that covers less. A process recipe holds a level between ramps, so
// the arm's null is not a property of the option — it is a property of the arm. That is
// exactly the kind of claim only a second plant can falsify, so both are run here.
const runs = {};
for (const dwell of [false, true]) {
  const { pilot, steps } = await commission(GMP, dwell);
  const st = pilot.status();
  const off = runRecipe(GMP, pilot, false);
  const on = runRecipe(GMP, pilot, true);
  runs[dwell ? 'dwell' : 'plain'] = { pilot, st, off, on, steps,
    ratio: off.rms / on.rms };
  console.log(`    excitation ${dwell ? 'WITH dwell   ' : 'without dwell'}: verify `
    + `${st.report.verify.ratio.toFixed(2)}x · recipe ${off.rms.toFixed(3)} → `
    + `${on.rms.toFixed(3)} cm rms (${(off.rms / on.rms).toFixed(2)}x) · worst `
    + `${off.worst.toFixed(2)} → ${on.worst.toFixed(2)} cm · u peak ${on.uPk.toFixed(3)} V`);
}
const D = runs.dwell, P = runs.plain;
console.log(`    commissioned in ${D.steps} steps = ${(D.steps * DT / 60).toFixed(0)} min of `
  + `process time; Ts ${D.st.Ts}, Tset ${D.st.Tset}, sample ${D.st.sample}, N ${D.st.N}, `
  + `rings ${JSON.stringify(D.st.rings)}, windows `
  + `${D.st.report.readouts.map((r) => r.stride).join('/')}`);

// --- what transferred with no change to lib/pilot at all
check('the pilot measures a timescale on a plant with no inertia in it anywhere',
  D.st.Ts > 50 && D.st.Ts < 60000, `Ts ${D.st.Ts}`);
check('…chooses its own windows and ridge on held-out data from these signals',
  D.st.report.readouts.every((r) => r.r2Lead0 > 0.5 && !r.gated),
  JSON.stringify(D.st.report.readouts.map((r) => r.r2Lead0.toFixed(3))));
check('…asks for NO frequency sweep, because a tank has no mode to ring',
  D.st.rings.every((r) => r < 2), JSON.stringify(D.st.rings));
check('…and the machine vouched for the controller before it deployed',
  D.pilot.verdict.deploy === true && D.st.report.verify.ratio > 1,
  JSON.stringify(D.pilot.verdict));
check('on a recipe it never saw, level error falls — cm of liquid, from volts of pump',
  D.ratio > 1.3, D.ratio.toFixed(2) + 'x');
check('…without exceeding the engineer\'s correction cap',
  D.on.uPk <= UCAP + 1e-12, D.on.uPk.toFixed(4));

// --- the A/B itself, asserted so the finding cannot rot back
// GATED ON THE PROPERTY, NOT ON THE MULTIPLE. The first version froze the measured
// 1.43x, and brick 49's probe fixes — which are correctness, not tuning — moved both
// sides legitimately (1.47/1.03 became 1.32/1.11). What has to hold is that a dwelling
// excitation wins on a dwelling plant; the size of the win is a number to report.
check('an excitation that DWELLS beats one that only sweeps, on a plant that dwells',
  D.ratio > 1.15 * P.ratio,
  `${D.ratio.toFixed(2)}x with vs ${P.ratio.toFixed(2)}x without`);
check('…and it gets there on LESS authority, which is what says it learned rather than shoved',
  D.on.uPk < P.on.uPk, `${D.on.uPk.toFixed(3)} V vs ${P.on.uPk.toFixed(3)} V`);

// --- THE VERIFY AND THE PROGRAM, AND THIS CHECK HAS ALREADY GONE STALE ONCE — in the
// direction rule 4 warns about, which is the code getting better. It first recorded a
// 3.8x OVERSTATEMENT: the verify scored a filtered-noise scribble drawn from the
// excitation's distribution while the recipe holds and ramps, and on this plant those
// regimes disagree. Brick 50 made the verify dwell whenever the excitation was told to,
// and the gap closed to within a factor — on this plant it now slightly UNDERSTATES,
// which is the safe direction for a gate. The Wood–Berry column shows the same repair
// is NOT sufficient there (8x, still certifying a controller that harms), so this is a
// partial fix recorded as one.
console.log(`    the verify reported ${D.st.report.verify.ratio.toFixed(2)}x against `
  + `${D.ratio.toFixed(2)}x on the recipe — within a factor since the verify learned to `
  + 'dwell, against 3.8x before it did');
check('the verify now tracks the program benefit within a factor of two on this plant',
  D.st.report.verify.ratio / D.ratio > 0.5 && D.st.report.verify.ratio / D.ratio < 2,
  `${(D.st.report.verify.ratio / D.ratio).toFixed(2)}x`);

// ========================================= NON-MINIMUM PHASE: the one that bites
// gamma1 + gamma2 < 1 puts a zero in the right half plane: raise a pump and the level it
// controls first FALLS. No feedforward inverse can cancel that, and a controller
// claiming the minimum-phase win here would be measuring something other than it thinks.
const GNM = [0.43, 0.34];
const { pilot: pn } = await commission(GNM, true);
const stn = pn.status();
const offN = runRecipe(GNM, pn, false), onN = runRecipe(GNM, pn, true);
const ratioN = offN.rms / onN.rms;
console.log(`    non-minimum phase (γ ${GNM}): ${pn.verdict.deploy ? 'DEPLOYED' : 'REFUSED'} · verify `
  + `${stn.report.verify ? stn.report.verify.ratio.toFixed(2) + 'x' : '—'} · recipe `
  + `${offN.rms.toFixed(3)} → ${onN.rms.toFixed(3)} cm rms (${ratioN.toFixed(2)}x) · `
  + `open-loop error is ${(offN.rms / D.off.rms).toFixed(1)}x the minimum-phase plant's`);
// AND THE GATE DID ITS JOB WITHOUT BEING TOLD ANYTHING ABOUT ZEROS. It measured 0.91x
// on its own scribble — below one — and declined, so the recipe runs untouched at
// exactly 1.00x. That is the whole refusal contract working on a plant nobody wrote it
// for: the pilot cannot know what a right-half-plane zero IS, and it does not have to,
// because it does not deploy a controller the machine has not vouched for.
check('the pilot REFUSES the plant it cannot help, rather than deploying anyway',
  pn.verdict.deploy === false, JSON.stringify(pn.verdict));
check('…so the recipe is left exactly as it was',
  ratioN > 0.98 && ratioN < 1.02, ratioN.toFixed(3) + 'x');
check('…and it does not claim the minimum-phase win, because the RHP zero forbids it',
  ratioN < D.ratio, `${ratioN.toFixed(2)}x vs ${D.ratio.toFixed(2)}x`);

console.log(`    (three commissionings and six scored recipes in ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
console.log(failed ? `\npilot/tanks: ${failed} check(s) FAILED\n` : '\npilot/tanks: all checks passed\n');
process.exit(failed ? 1 : 0);
