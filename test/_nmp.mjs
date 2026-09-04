// IS THE CORRECTION PATH NON-MINIMUM-PHASE? — the owner's inverted-pendulum reading, put to the
// machine, and the one plant property that would explain every result in this section at once.
//
// THE OWNER'S FRAME: "this reminds me of the inverted pendulum where the base is moved the wrong
// way preemptively at a speed that causes the tip to move only slightly and tip into the
// direction of motion and then the base can translate and then it has to do the opposite to
// stop. We have to do a similar thing but with the flexible links and it is pose dependant."
//
// THAT IS A RIGHT-HALF-PLANE ZERO. A cart-and-pendulum, and a flexible beam driven at its base,
// are both NON-COLLOCATED: the actuator and the thing being controlled are separated by
// compliance, and the tip's FIRST motion is opposite to where it will end up. Two consequences
// that are not opinions:
//   1. THE EXACT INVERSE OF AN NMP PLANT IS UNSTABLE. Every knob this section found helpful
//      SHRINKS an inverse — `mu`, fewer QP iterations, a larger claimed kernel gain, a larger
//      `lambda`. Those are not four findings, they are one, and it is a stabilisation rather
//      than a repair.
//   2. THE TREATMENT IS PREVIEW, NOT DAMPING. An NMP plant is inverted stably only NON-CAUSALLY
//      — you must act early and in the wrong direction first — and the look-ahead has to cover
//      the zero's own time constant. Mode ⑩ compiles against the whole lap, which is unlimited
//      preview, and reaches 44x.
//
// THE MEASUREMENT, ON THE MACHINE AND WITHOUT COMMISSIONING. Difference two runs of the
// deterministic plant around a `du` step applied WHILE MOVING, at several phases of the lap, and
// report per channel: the sign of the first motion against the sign of the settled DC, the peak
// of any reverse excursion as a fraction of the DC, and how long it lasts. Both signs of `du`
// are run, because a reverse excursion that appears for one sign only is friction, not a zero.
//
// MEASURED ON THE DIAGONAL AND IT IS A NULL: the reverse peak is 1e-8 to 1e-12 against a DC of
// 1.0, at every phase and both signs, on both channels. The path a joint offset takes to its OWN
// error is minimum-phase. THE CROSS CHANNELS ARE THE HALF THAT WAS MISSING (rule 9): an arm's
// joints react against each other, so "move the wrong way first" on a COUPLED plant would show
// up as a reversal in the response of the OTHER channel — which the diagonal cannot see, and
// which is where a two-link arm's version of the pendulum would have to live.
//
// WHAT WOULD KILL IT: the response rises monotonically toward its DC from the first sample at
// every phase and both signs. Then the path is minimum-phase, preview buys nothing beyond the
// forecast's own reach, and the regularisation reading stands.
import { makeArm, mkPath, homeArm, routeSignals, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.NM_SHAPE || 'sharp';
const FEED = +(process.env.NM_FEED || 0.004);
// THE STEP SIZES, AND SWEEPING THEM IS THE INSTRUMENT CHECK RATHER THAN AN EXTRA RESULT. The
// first cross-channel run used a single 0.3 rad step held for 4000 steps on a SHARP-CORNER
// program — half a lap driven off the path — and reported reverse excursions of 131% to 285% of
// the DC. Two things in that table are not what a linear response looks like: the normalised
// response `(pulsed - base)/du` flips SIGN between +du and -du, and the reverse peak appears for
// one sign only. Both are consistent with a large-signal effect — backlash crossed in one
// direction, or the two trajectories simply meeting a corner differently — rather than with a
// zero. A LINEAR response is invariant in `du`; a large-signal one is not. So the same cell is
// run at several amplitudes and the invariance is the finding, not the number (rule 17).
const DUS = (process.env.NM_DUS || '0.3,0.1,0.03,0.01').split(',').map(Number);
const DU = DUS[0];
const NPH = +(process.env.NM_NPH || 4);
const WIN = +(process.env.NM_WIN || 4000);

console.log(`arm K ${PG.K} / E ${PG.E}, ${SHAPE} at feed ${FEED}, step ${DU} rad`);
const path = mkPath(SHAPE, FEED);
const LAP = Math.round(path.lap);
console.log(`lap ${LAP} solver steps; response watched for ${WIN} steps after the step`);

const run = async (ch, at, du) => {
  const { arm, servo } = await makeArm();
  homeArm(arm, servo, path);
  const out = [];
  for (let k = 0; k < (at === null ? LAP + NPH * 0 : at) + WIN + 8; k++) {
    const c = path.at(k);
    const [q1, q2] = arm.ik(c.x, c.y, true);
    const rt = arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    const on = at !== null && k >= at;
    const u = [on && ch === 0 ? du : 0, on && ch === 1 ? du : 0];
    const tau = servo.torques([{ theta: q1 + u[0], omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2 + u[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
    arm.step(tau[0], tau[1], 1);
    if (at !== null && k >= at) out.push(routeSignals(arm, [{ pos: q1 }, { pos: q2 }], tau).truth.slice());
  }
  await arm.l1.destroy(); await arm.l2.destroy();
  return out;
};

// the SAME base run serves every step, so the difference is exactly the response to `du`
const baseAt = async (at) => {
  const { arm, servo } = await makeArm();
  homeArm(arm, servo, path);
  const out = [];
  for (let k = 0; k < at + WIN + 8; k++) {
    const c = path.at(k);
    const [q1, q2] = arm.ik(c.x, c.y, true);
    const rt = arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    const tau = servo.torques([{ theta: q1, omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2, omega: rt.dq[1], alpha: rt.ddq[1] }]);
    arm.step(tau[0], tau[1], 1);
    if (k >= at) out.push(routeSignals(arm, [{ pos: q1 }, { pos: q2 }], tau).truth.slice());
  }
  await arm.l1.destroy(); await arm.l2.destroy();
  return out;
};

console.log('\n  SYMMETRIC and ANTISYMMETRIC halves of the response, per amplitude.');
console.log('  A LINEAR response lives entirely in the SYMMETRIC half and is invariant in du; a');
console.log('  direction-dependent one (backlash, friction) lives in the antisymmetric half and is');
console.log('  not. Only a reverse excursion in the SYMMETRIC half is a zero.');
console.log('\n  ch->out  phase    du    sym DC     sym rev    as %DC     asym DC    asym rev');
for (let ch = 0; ch < 2; ch++) {
  for (let p = 0; p < NPH; p++) {
    const at = Math.round(LAP + (p * LAP) / NPH);
    const base = await baseAt(at);
    for (const mag of DUS) {
      const plus = await run(ch, at, mag), minus = await run(ch, at, -mag);
      for (let oc = 0; oc < 2; oc++) {
        const n = Math.min(base.length, plus.length, minus.length, WIN);
        const sym = [], asym = [];
        for (let i = 0; i < n; i++) {
          const rp = (plus[i][oc] - base[i][oc]) / mag;
          const rm = (minus[i][oc] - base[i][oc]) / -mag;
          sym.push((rp + rm) / 2); asym.push((rp - rm) / 2);
        }
        const stat = (r) => {
          const dc = r.slice(Math.floor(n * 0.9)).reduce((a, v) => a + v, 0)
            / Math.max(1, n - Math.floor(n * 0.9));
          const sg = Math.sign(dc) || 1;
          let rev = 0, revAt = 0;
          for (let i = 0; i < n; i++) { const v = r[i] * sg; if (v < rev) { rev = v; revAt = i; } }
          return { dc, rev: rev * sg, pct: 100 * rev / Math.max(1e-30, Math.abs(dc)), revAt };
        };
        const S = stat(sym), A = stat(asym);
        console.log(`  ${ch}->${oc}  ${String(at - LAP).padStart(5)}  ${mag.toFixed(2).padStart(5)}  `
          + `${S.dc.toExponential(3)}  ${S.rev.toExponential(3)}  ${S.pct.toFixed(1).padStart(7)}%  `
          + `${A.dc.toExponential(3)}  ${A.rev.toExponential(3)}  (sym peak ${S.revAt})`);
      }
    }
  }
}
console.log('EXIT 0');
