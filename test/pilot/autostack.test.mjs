/**
 * @file ONE BUTTON ON A REAL SERVO AXIS — and the conventional layer wins.
 *
 * `autostack.js` is the whole of `lib/pilot/` behind one call. What it is TOLD here is the
 * axis's travel and rate limits, how much correction authority it may use, that the program
 * repeats every 6240 samples, and where to read the reference's derivatives. What it works
 * out for itself is its timescale, whether each rung is worth deploying, how deep to
 * cascade, and which prefix of the ladder to ship — every one of those by measuring on the
 * machine rather than by a rule.
 *
 * THE ANSWER IT COMES TO IS NOT THE ONE THIS PROJECT WOULD HAVE PREDICTED, which is the
 * point of letting it decide. It ships the CONVENTIONAL rung alone: four coefficients,
 * fourteen laps, 425x — and refuses both the pilot and the harmonic layer on top of it.
 *
 *     as it arrived                        0.5764 mm
 *     conventional (self-tuned)            0.0014 mm    425x    <- shipped
 *     + pilot cascade, depth 1             0.0034 mm   0.39x    refused: worse
 *     + lap-periodic (harmonic)            0.0001 mm            refused: below the floor
 *
 * BOTH REFUSALS ARE RIGHT AND THEY ARE RIGHT FOR DIFFERENT REASONS.
 *
 * The PILOT is refused because it has nothing left to model. This project already measured
 * that its entire benefit on this axis is the velocity-lag term q̇/kp — and the conventional
 * rung's dominant coefficient IS that term, recovered from data to 1% (0.797 mm fitted
 * against 0.129/160 = 0.806 mm). Having removed it, what remains is at the rig's noise floor
 * and the pilot models noise. A layer that arrives second gets what the first one left.
 *
 * The HARMONIC layer is refused because the INSTRUMENT CANNOT SEE THE DIFFERENCE. It reaches
 * 0.00014 mm, ten times better than the rung below it — and the rig reproduces the recorded
 * hardware to 0.0016 mm and the machine repeats lap to lap to 0.0003 mm. A deterministic
 * simulation of a perfectly repeating plant has no floor of its own, so a lap-indexed layer
 * will happily report four thousand x on it. That is a property of the simulator. The stack
 * is given the floor and declines to credit anything below it, which is why it ships the
 * rung that is measurable and TRANSFERS over the one that is neither.
 *
 * AND THAT IS THE DISTINCTION THE WHOLE FILE TURNS ON. The conventional rung's coefficients
 * multiply the REFERENCE'S OWN derivatives, so they are evaluated live on whatever the
 * machine is asked to do next; the harmonic rung is a table indexed by lap phase. Measured
 * on a two-tone sine this axis has never run:
 *
 *     open loop                                  0.4754 mm
 *     the same four coefficients, evaluated live 0.0028 mm   169.8x
 *     the identical signal replayed as a table   0.8987 mm     0.53x
 *
 * The third row is the control: the SAME correction signal, indexed by sample instead of by
 * the reference's state, makes the machine worse than not correcting at all. It independently
 * reproduces the 0.55x this project measured for a phase-indexed ILC table on an unseen
 * program. Memory does not transfer; a model does.
 */
import { P, PR, makeMachine, KP } from './emps-rig.mjs';
import { AutoStack } from '../../lib/pilot/autostack.js';
import { ClassicFF, motionBasis } from '../../lib/pilot/classic.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\npilot: one button on a real servo axis — and the conventional layer wins\n');

const FLOOR = 1.6e-3;    // the rig reproduces the recorded hardware to 1.6 µm rms
const basis = motionBasis([{ v: PR.v, a: PR.a }]);

// ---------------------------------------------------------------- ① the conventional rung
const cff = new ClassicFF({ basis, channels: 1, uMax: 2e-3 });
function driveC(corr, laps = 8) {
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
const rc = await cff.commission(async (c) => driveC(c));
console.log(`    conventional: ${rc.base.toExponential(4)} → ${rc.best.toExponential(4)} mm`
  + `   ${(rc.base / rc.best).toFixed(1)}x   ${rc.laps} laps   fit residual ${rc.rel.toFixed(4)}`);
console.log(`      ${rc.names.map((n, j) => `${n} ${(1000 * rc.coeff[0][j]).toFixed(3)}mm`).join('   ')}`);

check('four coefficients fitted on the machine beat the INVERSE-DYNAMICS FEEDFORWARD at the '
  + 'published M, Fv, Fc and OF — a learned correction reaching a model-based one with no model',
  rc.best <= 0.0021 + 1e-9, `${rc.best.toExponential(4)} vs 2.1e-3`);
check('…and it costs under twenty laps to do it', rc.laps < 20, `${rc.laps}`);

// THE COEFFICIENT IS CHECKABLE AGAINST PHYSICS, which is what a learned model cannot offer.
// The basis is normalised to unit peak, so the velocity coefficient IS the loop's own lag at
// peak speed. An independent route agreeing is worth more than a better score (rule 15).
const vIdx = rc.names.indexOf('v0');
const lag = basis.scale[vIdx] / KP;
console.log(`      the velocity coefficient is ${(1000 * rc.coeff[0][vIdx]).toFixed(3)} mm `
  + `against the position loop's own lag vPeak/kp = ${(1000 * lag).toFixed(3)} mm`);
check('…and the dominant coefficient IS the position loop\'s velocity lag, recovered from '
  + 'data to within 5% of vPeak/kp — an independent route agreeing, not a better score',
  Math.abs(rc.coeff[0][vIdx] - lag) < 0.05 * lag,
  `${rc.coeff[0][vIdx].toExponential(3)} vs ${lag.toExponential(3)}`);

// ------------------------------------------------- ② it is a MODEL, not a memory: transfer
function twoTone(n) {
  const q = new Float64Array(n), v = new Float64Array(n), a = new Float64Array(n);
  const mid = 0.125, A1 = 0.055, A2 = 0.022, w1 = 2 * Math.PI * 0.21, w2 = 2 * Math.PI * 0.53;
  for (let k = 0; k < n; k++) {
    const t = k * 1e-3;
    q[k] = mid + A1 * Math.sin(w1 * t) + A2 * Math.sin(w2 * t);
    v[k] = A1 * w1 * Math.cos(w1 * t) + A2 * w2 * Math.cos(w2 * t);
    a[k] = -A1 * w1 * w1 * Math.sin(w1 * t) - A2 * w2 * w2 * Math.sin(w2 * t);
  }
  return { q, v, a };
}
const N2 = 12000, T = twoTone(N2);
const tbl = new Float64Array(P);
for (let k = 0; k < P; k++) tbl[k] = cff.at(k)[0];
function drive2(mode) {
  const m = makeMachine(T.q[0], 0);
  let s = 0, n = 0;
  for (let k = 0; k < N2; k++) {
    const kk = Math.max(0, k - 1);
    const u = mode === 'live' ? cff.live([T.v[kk]], [T.a[kk]])[0]
      : (mode === 'table' ? tbl[kk % P] : 0);
    m.step(T.q[kk] + u);
    if (k > 2000) { const e = m.q - T.q[k]; s += e * e; n++; }
  }
  return 1000 * Math.sqrt(s / n);
}
const o2 = drive2('off'), l2 = drive2('live'), t2 = drive2('table');
console.log(`\n    a two-tone sine the axis has NEVER run:`);
console.log(`      open loop                                   ${o2.toExponential(4)} mm`);
console.log(`      the same four coefficients, evaluated live  ${l2.toExponential(4)} mm   ${(o2 / l2).toFixed(1)}x`);
console.log(`      the identical signal replayed as a table    ${t2.toExponential(4)} mm   ${(o2 / t2).toFixed(2)}x`);
// BOTH HALVES (rule 9): the model transfers AND the memory of the same signal does not.
check('the coefficients transfer to a trajectory the machine has never run, because they '
  + 'multiply the reference\'s own state rather than an index', o2 / l2 > 50, `${(o2 / l2).toFixed(1)}x`);
check('…and the IDENTICAL correction signal replayed as a lap-indexed table makes that '
  + 'machine WORSE THAN NOTHING — which is the difference between a model and a memory, on '
  + 'one signal, with everything else held', t2 > o2, `table ${t2.toExponential(3)} vs open ${o2.toExponential(3)}`);

// -------------------------------------------------------------- ③ the button, end to end
const auto = new AutoStack({
  channels: [{ lo: -0.02, hi: 0.27, vMax: 1.25e-4, aMax: 8.3e-7, jMax: 5e-8 }],
  uMax: 2e-3,
  floor: FLOOR,
  periodic: P,
  basis: motionBasis([{ v: PR.v, a: PR.a }]),
  pilot: { nMeasured: 1, start: [PR.q[0]], guards: [{ index: 0, max: 0.4 }],
    workspace: () => true, seed: 1, exciteSteps: 40000 },
});
let stackPk = 0;
function run(extra) {
  return Promise.resolve().then(() => {
    const m = makeMachine(PR.q[0], 0);
    auto.beginRun();
    let s = 0, n = 0; const e = new Float64Array(P);
    for (let k = 0; k < 8 * P; k++) {
      const kk = ((k - 1) % P + P) % P;
      const S = auto.stack ? auto.stack.sample : 1;
      const look = (off) => [PR.q[((((Math.floor(k / S) + off) * S) % P) + P) % P]];
      let u = auto.act({ v: [PR.v[kk]], a: [PR.a[kk]], k: kk, look })[0];
      if (auto.deployed.stack) stackPk = Math.max(stackPk, Math.abs(auto.stack.act(look)[0]));
      if (extra) u += extra.at(kk)[0];
      m.step(PR.q[kk] + Math.max(-2e-3, Math.min(2e-3, u)));
      auto.observe([m.q]);
      const ee = m.q - PR.q[k % P];
      if (k >= 7 * P) e[k % P] = ee;
      if (k >= 4 * P) { s += ee * ee; n++; }
    }
    return { score: 1000 * Math.sqrt(s / n), err: [e] };
  });
}
async function drivePilot(st) {
  const m = makeMachine(PR.q[0], 0);
  let prevRef = PR.q[0], p1 = PR.q[0], v1 = 0;
  while (st.phase !== 'done') {
    if (st.phase === 'fit') { st.work(); continue; }
    const cmd = st.command();
    m.step(prevRef);
    // THE RUNG BELOW IS EVALUATED ON THE TRAJECTORY ACTUALLY BEING COMMANDED — which during
    // commissioning is the pilot's own excitation, not the program. Fed the program's
    // derivatives instead, the conventional rung corrects for a trajectory the machine is
    // not on and the pilot deploys straight into its clamp: measured, 2.000 mm peak against
    // a 2.0 mm cap and the machine 1500x worse. Rule 11.
    const v = (cmd[0].pos - p1) / 1e-3, a = (v - v1) / 1e-3;
    p1 = cmd[0].pos; v1 = v;
    prevRef = cmd[0].pos + cmd[0].u + auto.act({ v: [v], a: [a] })[0];
    st.observe([m.q], [m.q - cmd[0].pos]);
  }
}
const rep = await auto.commission({ run, drivePilot });
console.log('\n    the button — nothing set but the maxes, the authority and the floor:\n');
console.log(auto.table());
console.log(`\n    shipped ${JSON.stringify(rep.deployed)}   ${rep.base.toExponential(4)} → `
  + `${rep.best.toExponential(4)} mm   ${rep.gain.toFixed(1)}x`);

const byName = Object.fromEntries(rep.rungs.map((r) => [r.name.split(',')[0], r]));
check('the button ships something that improves the machine at least 100x, chosen from a '
  + 'ladder it measured rather than a rung it was told to use',
  rep.gain > 100 && rep.deployed.classic, `${rep.gain.toFixed(1)}x ${JSON.stringify(rep.deployed)}`);
check('…and what it ships is the rung that TRANSFERS, not the lap-indexed one that scored '
  + 'better below the instrument\'s floor', rep.deployed.classic && !rep.deployed.hff,
  JSON.stringify(rep.deployed));
check('…and the refused rungs are REPORTED with what they measured, not hidden — a refusal '
  + 'that fires silently hides the thing worth looking at',
  rep.rungs.length >= 3 && rep.rungs.every((r) => typeof r.score === 'number'),
  JSON.stringify(rep.rungs.map((r) => r.name)));

// THE PILOT WAS ARMED AND ACTING WHEN IT WAS SCORED. Without this the report cannot tell a
// rung that refused from one that was armed and contributed zeros — which cost a run here.
check('the pilot rung was genuinely driving the machine when it was scored, so "it did not '
  + 'help" is a measurement and not a wiring fault',
  stackPk > 0 && stackPk < 2e-3, `peak |u| ${stackPk.toExponential(3)} m against a 2.0e-3 cap`);
check('…and it was refused, because the rung below it had already removed the velocity lag '
  + 'that is this pilot\'s whole benefit on this axis',
  !rep.deployed.stack, `${JSON.stringify(rep.deployed)}`);

// THE FLOOR IS LOAD-BEARING, and both directions of it are asserted.
const hffRung = rep.rungs.find((r) => r.name.startsWith('lap-periodic'));
const hffObj = auto.built.hff;
check('the harmonic rung really did score better than the one that shipped — so the refusal '
  + 'is the FLOOR talking and not a rung that failed',
  hffRung && hffRung.score < rep.best, hffRung ? hffRung.score.toExponential(3) : 'absent');
check('…and every rung that landed below the instrument\'s floor says so in its own row',
  rep.rungs.filter((r) => r.score <= FLOOR).every((r) => /FLOOR/.test(r.note || '')),
  JSON.stringify(rep.rungs.map((r) => [r.score.toExponential(2), r.atFloor])));


// ---------------------------------------------------------------------------------------
// THE DEPLOY PATH OF EVERY RUNG, ASSERTED DIRECTLY — because the run above does not take it.
//
// On this axis the conventional rung wins and the other two are REFUSED, so `act()` summing a
// deployed pilot or a deployed harmonic never executes in it. That is precisely the hole that
// let mode ⑧ ship containing neither of its two halves while every check passed: the checks
// asserted that a toggle CHANGED the output, and an amputated half still changes it. So arm
// each rung on its own and assert `act()` returns EXACTLY that rung's own correction, then
// arm them together and assert the result is exactly the sum (rule 6 — where two views show
// one quantity, assert they AGREE, bit for bit).
{
  const A = new AutoStack({ channels: [{ lo: -0.02, hi: 0.27, vMax: 1.25e-4, aMax: 8.3e-7, jMax: 5e-8 }],
    uMax: 1e9, periodic: P, basis: motionBasis([{ v: PR.v, a: PR.a }]) });
  A.classic = auto.built.classic; A.hff = auto.built.hff;
  // a stand-in pilot whose contribution is a known constant, so "the stack term is present"
  // is checkable without commissioning another one
  A.stack = { sample: 1, act: () => [0.125], observe: () => {}, layers: [] };
  const ctx = { v: [PR.v[100]], a: [PR.a[100]], k: 100, look: () => [PR.q[100]] };

  A.deployed = { classic: true, stack: 0, hff: false };
  const only1 = A.act(ctx)[0];
  A.deployed = { classic: false, stack: 1, hff: false };
  const only2 = A.act(ctx)[0];
  A.deployed = { classic: false, stack: 0, hff: true };
  const only3 = hffObj ? A.act(ctx)[0] : 0;
  A.deployed = { classic: true, stack: 1, hff: !!hffObj };
  const all = A.act(ctx)[0];

  check('the conventional rung, armed alone, puts its OWN correction on the output — not a '
    + 'rung that is present in the wiring and contributing zero',
    only1 !== 0 && only1 === auto.classic.live(ctx.v, ctx.a)[0],
    `act ${only1} vs live ${auto.classic.live(ctx.v, ctx.a)[0]}`);
  check('…the pilot rung likewise, through the look-ahead closure and not around it',
    only2 === 0.125, `${only2}`);
  check('…and the harmonic rung likewise, indexed by lap phase',
    !hffObj || (only3 !== 0 && only3 === auto.built.hff.at(100)[0]),
    hffObj ? `act ${only3} vs at(100) ${auto.built.hff.at(100)[0]}` : 'no harmonic rung built');
  check('…and all three armed together is EXACTLY their sum, so no rung is silently dropped '
    + 'or double-counted when they are combined',
    Math.abs(all - (only1 + only2 + only3)) < 1e-15,
    `${all} vs ${only1 + only2 + only3}`);

  // THE CONVENTIONAL RUNG'S OWN CAP. On this axis its correction is a thousandth of the
  // authority it is given, so the cap never binds and nothing here would notice it being
  // removed — mutation-testing this suite, "the conventional rung ignores its authority"
  // SURVIVED. Assert it directly, on coefficients large enough to demand more than the cap.
  {
    const bas = motionBasis([{ v: PR.v, a: PR.a }]);
    const C = new ClassicFF({ basis: bas, channels: 1, uMax: 1e-4 });
    for (let j = 0; j < C.nb; j++) C.W[0][j] = 1;      // deliberately far past the authority
    C.touch();
    let pk = 0;
    for (let k = 0; k < P; k++) pk = Math.max(pk, Math.abs(C.at(k)[0]));
    let pkLive = 0;
    for (let k = 0; k < P; k++) pkLive = Math.max(pkLive, Math.abs(C.live([PR.v[k]], [PR.a[k]])[0]));
    check('the conventional rung honours its OWN authority — asserted on coefficients that '
      + 'demand far more than it, because on this axis the cap never binds by itself',
      pk <= 1e-4 * (1 + 1e-9) && pk > 1e-4 * 0.99, `lap-indexed peak ${pk.toExponential(3)} against a 1.0e-4 cap`);
    check('…and the live path is capped identically to the lap-indexed one, so a rung cannot '
      + 'be bounded when replayed and unbounded when driven',
      Math.abs(pk - pkLive) < 1e-12, `at() ${pk.toExponential(6)} vs live() ${pkLive.toExponential(6)}`);
  }

  // THE COMMON CAP MUST ANNOUNCE ITSELF. A cap belonging to one rung, wrapped around another
  // that carries its own, ran a pilot at a sixth of its authority for an entire brick — and
  // it was invisible because clamping changes the output and reports nothing.
  const B = new AutoStack({ channels: A.channels, uMax: 1e-3, periodic: P, basis: A.basis });
  B.stack = { sample: 1, act: () => [0.125], observe: () => {}, layers: [] };
  B.beginRun();
  B.deployed = { classic: false, stack: 1, hff: false };
  const cut = B.act(ctx)[0];
  const cl = B.clipping();
  check('a rung demanding more than the COMMON cap is clipped — and the clipping is COUNTED, '
    + 'so an amputated rung shows up as a number instead of as a disappointing score',
    cut === 1e-3 && cl.frac === 1 && cl.over > 100,
    `out ${cut}, frac ${cl.frac}, over ${cl.over.toFixed(1)}x`);
  check('…and a rung that fits inside the cap reports NO clipping, so the counter is not '
    + 'simply always on', (() => { B.beginRun(); B.uMax = 1; B.act(ctx); return B.clipping().frac === 0; })(),
    'expected frac 0 with a cap the rung fits inside');
}

console.log(failed ? `\nautostack: ${failed} check(s) FAILED\n` : '\nautostack: all checks passed\n');
process.exit(failed ? 1 : 0);
