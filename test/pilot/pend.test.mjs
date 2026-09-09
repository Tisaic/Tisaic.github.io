/**
 * @file A SEVENTH PLANT, AND THE ONE CLASS THE OTHER SIX DO NOT CONTAIN: OPEN-LOOP UNSTABLE.
 *
 * The six plants this method is claimed on — the 2R arm, the quadruple tank, the extruder
 * barrel, Wood–Berry, the cold mill, the EMPS axis — share no physics, and they share one
 * thing: every one of them is STABLE without a controller. That is not a small omission. A
 * survey of the "universal controller" literature puts an inverted pendulum first among the
 * plants such a claim has to answer for, and it is exactly the case where this architecture's
 * shape is most exposed: `lib/pilot/` is a PREVIEW CORRECTION layer that sits on top of a loop
 * somebody else closed. On a stable plant that loop is a convenience. On an unstable one it is
 * the only reason the plant exists at all, and the question is whether a correction to its
 * REFERENCE still buys anything, or whether the stabiliser has already spent the authority.
 *
 * THE PLANT is a cart-pole with the pole measured from UPRIGHT — the textbook nonlinear form,
 * no small-angle approximation, with cart friction:
 *
 *     ẍ = [F + m L θ̇² sinθ − m g sinθ cosθ − b ẋ] / [M + m sin²θ]
 *     θ̈ = [−F cosθ − m L θ̇² sinθ cosθ + (M+m) g sinθ + b ẋ cosθ] / [L (M + m sin²θ)]
 *
 * It is UNSTABLE and the test asserts it: released at θ = 1e-4 rad with no force it passes
 * 0.5 rad in 1.36 s. Nothing in the other six does that.
 *
 * THE CONVENTIONAL MACHINE is the loop a real installation would already have — a cascade,
 * an outer position law leaning the pole toward the target and an inner angle law chasing the
 * lean, with the same clamps a real one carries. It is the denominator, exactly as
 * `RobotComp` is on the arm and the recipe's own volts are on the tank.
 *
 * WHAT THE PILOT IS TOLD: four measured signals (cart position, cart speed, pole angle, pole
 * rate), ONE correction channel (an offset on the cart's position reference, in metres), its
 * authority, the channel's box, and a GUARD on the pole angle — an index into the routed
 * signals and a number the engineer knows about their own machine, the same shape as the
 * tank's overflow and the arm's torque. It is told nothing about pendulums, nothing about
 * instability, and nothing about the loop underneath it.
 *
 * WHAT IS SCORED is the TIP, x + L sinθ, against the commanded cart reference — the analogue
 * of "tool minus forward kinematics" and NOT what the stabiliser regulates. The loop holds the
 * pole up and puts the cart where it was asked; the tip is where the work would happen, and it
 * lags and swings.
 *
 * THE OUTCOME IS NOT ASSUMED. Target 3 asks that every plant either improve or refuse for a
 * reason it can state; a refusal here is a result and is reported as one.
 */
import { Pilot } from '../../lib/pilot/pilot.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}
if (process.env.SUITE !== 'full') {
  console.log('pend: full tier only (SUITE=full) — skipping');
  process.exit(0);
}
console.log(`THE SEVENTH PLANT: an OPEN-LOOP UNSTABLE cart-pole, corrected at the reference${process.env.PEND_TUNED === '1' ? ' (loop TUNED)' : ''}\n`);

// ---------------------------------------------------------------- the plant
const M = 0.5, m = 0.2, L = 0.3, G = 9.81, B = 0.1, DT = 0.005;
const makeCart = () => ({ x: 0, v: 0, th: 0, w: 0 });
function stepCart(p, F) {
  const s = Math.sin(p.th), c = Math.cos(p.th), den = M + m * s * s;
  const ax = (F + m * L * p.w * p.w * s - m * G * s * c - B * p.v) / den;
  const aw = (-F * c - m * L * p.w * p.w * s * c + (M + m) * G * s + B * p.v * c) / (L * den);
  p.v += DT * ax; p.x += DT * p.v; p.w += DT * aw; p.th += DT * p.w;
}
// THE CONVENTIONAL MACHINE — the loop the installation already has.
// AND ITS GAINS ARE A KNOB, because §52.28 and §52.30 cost this project three sections: a
// stabilising loop nobody derived is a carried constant, and a ratio quoted against a weak
// denominator is the loop's number and not the controller's. Swept over 560 cells of its own
// four gains, the best cell reads 2.91e-2 m against this default's 1.03e-1 — 3.5x better — so
// BOTH are measured and both are reported. `PEND_TUNED=1` selects the swept best.
const TUNED = process.env.PEND_TUNED === '1';
const KX = TUNED ? 2 : 1, KV = TUNED ? 0.25 : 0.5, KP = TUNED ? 240 : 60, KD = TUNED ? 28 : 14;
const TH_LEAN = 0.25, F_MAX = 20;
function baseline(p, xr) {
  const thd = Math.max(-TH_LEAN, Math.min(TH_LEAN, -KX * (p.x - xr) - KV * p.v));
  return Math.max(-F_MAX, Math.min(F_MAX, KP * (p.th - thd) + KD * p.w));
}
const tipOf = (p) => p.x + L * Math.sin(p.th);

// ---------------------------------------------------------------- the program
const D = 0.5, ACC = 0.5, VMX = 0.35;
const TA = VMX / ACC, DA = 0.5 * ACC * TA * TA, TC = (D - 2 * DA) / VMX;
const TMOVE = 2 * TA + TC, DWELL = 0.6, LAP = Math.round(2 * (TMOVE + DWELL) / DT);
function ramp(t) {
  if (t < TA) return 0.5 * ACC * t * t;
  if (t < TA + TC) return DA + VMX * (t - TA);
  if (t < TMOVE) return D - 0.5 * ACC * (TMOVE - t) ** 2;
  return D;
}
function xrefAt(k) {
  const t = (((k % LAP) + LAP) % LAP) * DT;
  if (t < TMOVE) return ramp(t);
  if (t < TMOVE + DWELL) return D;
  if (t < 2 * TMOVE + DWELL) return D - ramp(t - TMOVE - DWELL);
  return 0;
}

// ------------------------------------------------- the plant really is unstable
{
  const q = makeCart(); q.th = 1e-4; let k = 0;
  for (; k < 4000; k++) { stepCart(q, 0); if (Math.abs(q.th) > 0.5) break; }
  check('the plant is OPEN-LOOP UNSTABLE — the class the other six do not contain',
    k < 400, `released at 1e-4 rad with no force it passes 0.5 rad in ${k} steps (${(k * DT).toFixed(2)} s)`);
}

// ------------------------------------------------------------- route and run
// THE AUTHORITY IS A KNOB, because a correction that sits AT its cap is the barrel's failure
// signature (north star target 7) and a number read at one cap is not a result. `PEND_UCAP`
// sweeps it; `PEND_SEED` sweeps the commissioning draw, because every plant's number here has
// been one draw until somebody checked (`test/pilot/spread.mjs`).
const UCAP = +(process.env.PEND_UCAP || 0.15);   // the correction's authority, in metres
const TH_GUARD = 0.30;          // the engineer's own limit on the pole, in radians
function commission(seed = 1, gate = true) {
  const p = makeCart();
  for (let i = 0; i < 2000; i++) stepCart(p, baseline(p, 0));   // settle at the start
  const pilot = new Pilot({
    autoRefuse: gate, nMeasured: 4,
    channels: [{ lo: -0.2, hi: 0.7, vMax: VMX * DT, aMax: ACC * DT * DT, jMax: ACC * DT * DT / TA }],
    uMax: UCAP,
    start: [0],
    // THE GUARD is the pole angle, routed as measured signal 2. It is what an engineer knows
    // about their own machine and it is the only thing here that is specific to a pendulum —
    // a number, not a model.
    guards: [{ index: 2, max: TH_GUARD }],
    workspace: (q) => q[0] > -0.25 && q[0] < 0.75,
    // The representative program, as every one of the six now runs (the `verifyRef` repair).
    verifyRef: (i, n) => [xrefAt(Math.round(i * LAP / n))],
    seed,
  });
  let steps = 0, toppled = false;
  while (pilot.phase !== 'done') {
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    const xr = cmd[0].pos + cmd[0].u;
    stepCart(p, baseline(p, xr));
    steps++;
    if (!isFinite(p.th) || Math.abs(p.th) > 1.0) { toppled = true; break; }
    pilot.observe([p.x, p.v, p.th, p.w], [tipOf(p) - cmd[0].pos]);
  }
  return { pilot, steps, toppled };
}

function runProgram(pilot, active) {
  const p = makeCart();
  for (let i = 0; i < 2000; i++) stepCart(p, baseline(p, 0));
  const S = pilot.sample;
  if (active) pilot._initRun();
  let s2 = 0, n = 0, uPk = 0, thPk = 0, worst = 0;
  for (let k = 0; k < LAP * 4; k++) {
    const xr = xrefAt(k);
    const u = active ? pilot.act((off) => [xrefAt((Math.floor(k / S) + off) * S)]) : [0];
    uPk = Math.max(uPk, Math.abs(u[0]));
    stepCart(p, baseline(p, xr + u[0]));
    pilot.observe([p.x, p.v, p.th, p.w], null);
    thPk = Math.max(thPk, Math.abs(p.th));
    if (k >= LAP) {                       // rule 13: the first lap is the start-up transient
      const e = tipOf(p) - xr; s2 += e * e; n++; worst = Math.max(worst, Math.abs(e));
    }
  }
  return { rms: Math.sqrt(s2 / Math.max(1, n)), worst, uPk, thPk };
}

const t0 = Date.now();
const { pilot, steps, toppled } = commission(+(process.env.PEND_SEED || 1), true);
check('the excitation did not topple the pole — the guard is the only pendulum-specific number',
  !toppled, toppled ? 'TOPPLED during commissioning' : `${steps.toLocaleString()} steps of probe, excite and verify`);
if (toppled) { console.log('\npend: FAILED (toppled)'); process.exit(1); }

const off = runProgram(pilot, false);
const on = runProgram(pilot, true);
const v = pilot.report.verify;
const deployed = !!(pilot.verdict && pilot.verdict.deploy);
console.log(`\n  the CONVENTIONAL machine (its own stabilising loop, no correction):`);
console.log(`    tip rms ${off.rms.toExponential(3)} m   worst ${off.worst.toExponential(3)}   |θ| peak ${off.thPk.toFixed(3)} rad`);
console.log(`  the pilot: ${deployed ? 'DEPLOYED' : 'REFUSED'}${pilot.verdict && pilot.verdict.why ? ` — ${pilot.verdict.why}` : ''}`);
console.log(`    tip rms ${on.rms.toExponential(3)} m   worst ${on.worst.toExponential(3)}   |θ| peak ${on.thPk.toFixed(3)} rad   uPk ${on.uPk.toFixed(4)} m of ${UCAP}`);
console.log(`    delivered ${(off.rms / on.rms).toFixed(3)}x    commissioning ${(steps * DT / 60).toFixed(1)} plant-minutes, ${((Date.now() - t0) / 1000).toFixed(0)} s of Node`);

// WHAT IS ASSERTED. Not that it wins — target 3 asks for improve-or-refuse-with-a-reason, and
// on a plant class this method has never met, either is a result. What must hold is that it is
// SAFE (the pole stays up under the correction), that it does not make the machine worse when
// it deploys, and that a refusal carries a reason.
check('the pole stays up with the correction applied', on.thPk < TH_GUARD,
  `|θ| peak ${on.thPk.toFixed(3)} rad against the ${TH_GUARD} guard`);
check('it does not make the machine worse: deploy only where it helps, refuse otherwise',
  !deployed || on.rms <= off.rms * 1.02,
  deployed ? `deployed and delivered ${(off.rms / on.rms).toFixed(3)}x` : `refused, so the machine is the baseline`);
check('a refusal states its reason', deployed || !!(pilot.verdict && pilot.verdict.why),
  deployed ? 'deployed, so not applicable' : String(pilot.verdict && pilot.verdict.why));
check('the correction stayed inside the authority it was given', on.uPk <= UCAP * 1.001,
  `${on.uPk.toFixed(4)} of ${UCAP} m`);

console.log(`\npend: ${failed ? `FAILED (${failed})` : 'all checks passed'}`);
process.exit(failed ? 1 : 0);
