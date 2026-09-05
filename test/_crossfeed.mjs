/**
 * @file DOES THE COUPLING SCALE WITH FEEDRATE? — the physics behind the transfer failure.
 *
 * `_mimowide.mjs` measured the off-diagonal solve on a WIDE excitation as the best contour this
 * investigation has produced on the cell it was commissioned for (2.42x -> 2.90x, oscillation
 * halved) and as a LOSS on four of the six cells it was scored on — worst at the slow feed,
 * where the circle goes 11.67x to 5.18x. Even the off-diagonal solve alone, on the shipped
 * excitation, loses at the slow feed.
 *
 * THERE IS A PHYSICAL STORY AND IT IS FALSIFIABLE. This arm's inter-joint coupling is inertial:
 * the Coriolis and centrifugal terms go as the SQUARE of joint rate, so a program run four times
 * slower has roughly a sixteenth of the coupling to model. A cross correction identified where
 * the coupling is large, applied where it is small, adds error rather than removing it — which
 * is the sign pattern the transfer table shows, on every program, at the slow feed.
 *
 * If that is right the fix is SCHEDULING rather than a better average, which is exactly the
 * conclusion `_mimomove.mjs` set up as its own falsifier, and it is a quantity the pilot already
 * carries in its row (commanded rate) rather than a constant anyone would tune.
 *
 * THE MEASUREMENT, and it needs no pilot. Difference two runs of the deterministic plant around
 * a +du and a -du step at several phases of the lap and keep the SYMMETRIC half — the linear one;
 * the antisymmetric half is the direction-dependent nonlinearity and no LTI kernel carries it.
 * That is `_mimomove.mjs`'s own probe, run across FEEDS instead of against a held kernel. What is
 * reported is the CROSS peak against the DIAGONAL peak, because an absolute cross response that
 * falls with feed is uninteresting if the diagonal falls with it (rule 19: match the metric's
 * support to the claim's — the claim is about the RATIO the solve gets wrong).
 *
 * WHAT WOULD KILL IT: the ratio flat across the feed span. Then the coupling is not what the
 * slow feed has less of, the inertial story is wrong, and the transfer loss needs another
 * explanation before anything is scheduled.
 *
 * Run: ARM_K=0.25 ARM_E=0.005 node test/_crossfeed.mjs
 */
import { makeArm, mkPath, homeArm, routeSignals, PG } from './pilot/rigs/arm-rig.mjs';

const FEEDS = (process.env.FEEDS || '4e-3,8e-3,1.6e-2').split(',').map(Number);
const SHAPES = (process.env.SHAPES || 'sharp,circle').split(',');
const DU = +(process.env.DU || 0.1);
const NPH = +(process.env.NPH || 4);
const LEN = +(process.env.LEN || 4000);

console.log(`\ncross against diagonal across the feed span — K ${PG.K} / E ${PG.E}, `
  + `${DU} rad at ${NPH} phases, ${LEN}-step window`);
console.log(`  the coupling is inertial, so the prediction is a ratio that RISES with feed\n`);
console.log(`  shape    feed      peak v      0->0        0->1        1->1        1->0    `
  + `   cross/diag`);

for (const shape of SHAPES) {
  for (const feed of FEEDS) {
    const path = mkPath(shape, feed);
    const LAP = Math.round(path.lap);
    let vPk = 0;
    const run = async (ch, at, du) => {
      const { arm, servo } = await makeArm();
      homeArm(arm, servo, path);
      const out = [];
      for (let k = 0; k < at + LEN + 8; k++) {
        const c = path.at(k);
        const [q1, q2] = arm.ik(c.x, c.y, true);
        const rt = arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
        vPk = Math.max(vPk, Math.abs(rt.dq[0]), Math.abs(rt.dq[1]));
        const on = du !== 0 && k >= at;
        const u = [on && ch === 0 ? du : 0, on && ch === 1 ? du : 0];
        const tau = servo.torques([{ theta: q1 + u[0], omega: rt.dq[0], alpha: rt.ddq[0] },
          { theta: q2 + u[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
        arm.step(tau[0], tau[1], 1);
        if (k >= at) out.push(routeSignals(arm, [{ pos: q1 }, { pos: q2 }], tau).truth.slice());
      }
      await arm.l1.destroy(); await arm.l2.destroy();
      return out;
    };
    const acc = [[new Float64Array(LEN), new Float64Array(LEN)],
      [new Float64Array(LEN), new Float64Array(LEN)]];
    for (let ph = 0; ph < NPH; ph++) {
      const at = Math.round(LAP + (ph * LAP) / NPH);
      const base = await run(0, at, 0);
      for (let c = 0; c < 2; c++) {
        const plus = await run(c, at, DU), minus = await run(c, at, -DU);
        for (let oc = 0; oc < 2; oc++) {
          const n = Math.min(LEN, base.length, plus.length, minus.length);
          for (let i = 0; i < n; i++) {
            const rp = (plus[i][oc] - base[i][oc]) / DU, rm = (minus[i][oc] - base[i][oc]) / -DU;
            acc[c][oc][i] += (rp + rm) / (2 * NPH);
          }
        }
      }
    }
    const pk = (a) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i])); return m; };
    const d00 = pk(acc[0][0]), d11 = pk(acc[1][1]), x01 = pk(acc[0][1]), x10 = pk(acc[1][0]);
    const ratio = (x01 + x10) / Math.max(1e-30, d00 + d11);
    console.log(`  ${shape.padEnd(8)} ${feed.toExponential(1)}  ${vPk.toExponential(2)}  `
      + `${d00.toExponential(3)}  ${x01.toExponential(3)}  ${d11.toExponential(3)}  `
      + `${x10.toExponential(3)}   ${ratio.toFixed(4)}`);
  }
}
console.log(`\n  a ratio flat across the span kills the inertial story and the scheduling that`);
console.log(`  would follow from it.\n`);
