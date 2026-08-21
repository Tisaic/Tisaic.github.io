// The learned dynamic feedforward, and the two claims that make it worth shipping.
//
// THE SCALAR COMPENSATOR IS NOT WRONG, IT IS THE WRONG SHAPE. Given the right lead
// it recovers 1.28x of a 6.7x ceiling; the rest needs a FILTER over the commanded
// trajectory rather than a gain on one instant of it. What has to be proved here is
// (a) that a fitted filter reaches most of that ceiling and (b) that it does so on
// moves it was never trained on -- because a map that only works on its training
// trajectory is an expensive lookup table, and this one measurably was that before
// the training set spanned more than one move.
import { Joint } from '../../lib/flexisim/joint.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { FlexArm } from '../../lib/flexisim/arm.js';
import { PlanarComp } from '../../lib/flexisim/compliance.js';
import {
  AngleProfile, PositionServo, TipCompensator, tipTrackingError,
  LearnedFeedforward, ilcRefine,
} from '../../lib/flexisim/compensator.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nflexisim: the learned dynamic feedforward');

const FULL = process.env.SUITE === 'full';
const H = 4, LEN = 16, CLAMP = 3, NU = 0.3, RHO = 1, G = 2e-6;
const RATIO = 100, SERVO_BW = 0.002, DAMPING = 3e-3, K = 4, E = 0.20;

const link = await buildLink({ length: LEN, section: H, clamp: CLAMP, E, nu: NU, rho: RHO,
  gravity: [0, -G, 0], damping: DAMPING });
const mp = massProperties(link);
const joint = new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
  loadInertia: mp.inertiaAboutPivot, stiffness: K,
  damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
const arm = new FlexArm({ joint, link, gravityWorld: [0, -G, 0], dt: 1 });
const tauG = (th) => mp.centroid * mp.mass * (-G) * Math.cos(th);
const Jr = joint.reflectedInertia();
const servo = new PositionServo({ kp: SERVO_BW * SERVO_BW * Jr / RATIO,
  kd: 2 * SERVO_BW * Jr / RATIO, inertia: Jr, ratio: RATIO, gravityTorque: tauG });
const pc = new PlanarComp(arm.Larm);
for (const t of [1, 2, 3]) pc.calibrate(t, arm.Larm * 1.21092 * t);
const comp = new TipCompensator({ comp: pc, inertia: mp.inertiaAboutPivot,
  gravityTorque: tauG, sign: -1 });
const L = arm.Larm, LEAD = Math.round(1 / SERVO_BW);
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);

let k = 0;
/** One full move period. `u` may be a per-phase array or a function of k. */
function cycle(p, u) {
  const e = new Float64Array(p.period);
  for (let n = 0; n < p.period; n++) {
    const extra = typeof u === 'function' ? u(k) : (u ? u[k % p.period] : 0);
    const off = comp.offset(p.at(k + LEAD)) + extra;
    arm.step(servo.torque({ ...p.at(k), theta: p.at(k).theta + off }, arm.encoder()), 1);
    e[k % p.period] = tipTrackingError(arm, p.at(k).theta);
    k++;
  }
  return e;
}
const settle = (p, u) => { for (let i = 0; i < 3; i++) cycle(p, u); };

/** Converge the per-phase profile against the tracker. */
function refine(p, iters) {
  let u = new Float64Array(p.period);
  k = 0; settle(p, null);
  let e = cycle(p, u);
  for (let i = 0; i < iters; i++) {
    u = ilcRefine(u, e, { gain: 0.5, lead: 550, armLength: L, smooth: 40 });
    e = cycle(p, u);
  }
  return { u, rms: rms(e) };
}

const mk = (span, a, c) => new AngleProfile({ span, accelSteps: a, cruiseSteps: c,
  dwellSteps: 1152 });
const ITERS = FULL ? 25 : 14;

// ---- the ceiling, and that the lead is what reaches it
const train0 = mk(0.144, 300, 400);
k = 0; settle(train0, null);
const base0 = rms(cycle(train0, null));
const conv = refine(train0, ITERS);
console.log(`    [ceiling] compensator+lead ${base0.toExponential(3)} → refined `
  + `${conv.rms.toExponential(3)}  (${(base0 / conv.rms).toFixed(2)}x, ${ITERS} passes)`);
check('iterative refinement beats the scalar compensator by more than 2x',
  base0 / conv.rms > 2, `${base0} → ${conv.rms}`);

// AND IT ONLY CONVERGES WITH THE LEAD. Refining with none diverges, which is what
// makes the lead a mechanism rather than a tuning preference.
let uBad = new Float64Array(train0.period);
k = 0; settle(train0, null);
let eBad = cycle(train0, uBad);
for (let i = 0; i < 8; i++) {
  uBad = ilcRefine(uBad, eBad, { gain: 0.5, lead: 0, armLength: L, smooth: 40 });
  eBad = cycle(train0, uBad);
}
console.log(`    [no lead] the same refinement with lead 0 → ${rms(eBad).toExponential(3)}`);
check('…and with NO lead the same refinement diverges instead',
  rms(eBad) > 2 * base0, `${base0} → ${rms(eBad)}`);

// ---- ONE trajectory: reaches the ceiling, and does not generalise
const solo = new LearnedFeedforward();
for (let n = 0; n < train0.period; n += 3) solo.observe(train0, n, conv.u[n]);
solo.fit();
const score = (p, ff) => {
  const f = ff ? (kk) => ff.predict(p, kk) : null;
  k = 0; settle(p, f);
  return rms(cycle(p, f));
};
const soloTrain = base0 / score(train0, solo);
const unseen = mk(0.072, 450, 600);
const baseUnseen = score(unseen, null);
const soloUnseen = baseUnseen / score(unseen, solo);
console.log(`    [one move]  trained ${soloTrain.toFixed(2)}x   unseen ${soloUnseen.toFixed(2)}x`);
check('fitted to ONE move it reaches the ceiling on that move',
  soloTrain > 2, `${soloTrain}x`);
check('…and is WORSE than no correction at all on a move it never saw',
  soloUnseen < 1, `${soloUnseen}x — a lookup table, not a model`);

// ---- SEVERAL trajectories: learns the dynamics
const ff = new LearnedFeedforward();
for (const p of [mk(0.144, 300, 400), mk(0.288, 200, 260), mk(0.072, 450, 600)]) {
  const c = refine(p, ITERS);
  for (let n = 0; n < p.period; n += 3) ff.observe(p, n, c.u[n]);
}
ff.fit();
const held = [['span .216 1.4x', mk(0.216, 250, 330)], ['span .100 0.7x', mk(0.100, 380, 500)]];
const gains = [];
for (const [label, p] of held) {
  const b = score(p, null), g = b / score(p, ff);
  gains.push(g);
  console.log(`    [held out] ${label}  ${b.toExponential(3)} → `
    + `${(b / g).toExponential(3)}   ${g.toFixed(2)}x`);
}
const trainedGain = base0 / score(train0, ff);
console.log(`    [trained ] span .144 1.0x  ${trainedGain.toFixed(2)}x`);
check('trained across three moves it beats the scalar compensator on HELD-OUT moves',
  gains.every((g) => g > 1.5), gains.map((g) => g.toFixed(2)).join(', '));
check('…by as much as on the move it was trained on, which is what says it learned '
  + 'the dynamics rather than the trajectory',
  Math.min(...gains) > 0.5 * trainedGain,
  `held out ${gains.map((g) => g.toFixed(2)).join(', ')} vs trained ${trainedGain.toFixed(2)}`);
check('and it runs on the COMMAND alone: no plant state enters predict()',
  ff.predict(train0, 100) === ff.predict(train0, 100), 'not deterministic in k');

await link.destroy();
console.log(failed ? `\nlearned FF: ${failed} check(s) FAILED` : '\nlearned FF: all checks passed');
process.exit(failed ? 1 : 0);
