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
// WHAT WOULD KILL IT: the response rises monotonically toward its DC from the first sample at
// every phase and both signs. Then the path is minimum-phase, preview buys nothing beyond the
// forecast's own reach, and the regularisation reading stands.
import { makeArm, mkPath, homeArm, routeSignals, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.NM_SHAPE || 'sharp';
const FEED = +(process.env.NM_FEED || 0.004);
const DU = +(process.env.NM_DU || 0.3);
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

console.log('\n  ch  phase   du     DC        first     reverse peak   as %DC   crosses at');
for (let ch = 0; ch < 2; ch++) {
  for (let p = 0; p < NPH; p++) {
    const at = Math.round(LAP + (p * LAP) / NPH);
    const base = await baseAt(at);
    for (const du of [DU, -DU]) {
      const pulsed = await run(ch, at, du);
      const n = Math.min(base.length, pulsed.length, WIN);
      const r = [];
      for (let i = 0; i < n; i++) r.push((pulsed[i][ch] - base[i][ch]) / du);
      const dc = r.slice(Math.floor(n * 0.9)).reduce((a, v) => a + v, 0) / Math.max(1, Math.ceil(n * 0.1));
      const sgn = Math.sign(dc) || 1;
      // THE REVERSE EXCURSION: the most negative the response goes in the DC's own frame, and
      // the first index at which it stops being on the wrong side of zero.
      let rev = 0, revAt = 0, cross = -1;
      for (let i = 0; i < n; i++) {
        const v = r[i] * sgn;
        if (v < rev) { rev = v; revAt = i; }
        if (cross < 0 && i > 0 && v > 0) cross = i;
      }
      // the first motion, read once the signal has left the numerical floor rather than at i=0
      const floor = 1e-4 * Math.abs(dc);
      let first = 0;
      for (let i = 0; i < n; i++) if (Math.abs(r[i]) > floor) { first = r[i]; break; }
      console.log(`  ${ch}  ${String(at - LAP).padStart(5)}  ${du > 0 ? '+' : '-'}   `
        + `${dc.toExponential(3)}  ${first.toExponential(3)}  ${(rev * sgn).toExponential(3)}`
        + `  ${(100 * rev / Math.abs(dc)).toFixed(1).padStart(7)}%  ${String(cross).padStart(5)}`
        + `  (peak at ${revAt})`);
    }
  }
}
console.log('EXIT 0');
