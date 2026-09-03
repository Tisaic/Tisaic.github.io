// Tighten the 4-parameter identification from the found point with shrinking steps,
// then quote the refined parameters (delivery re-run follows separately).
import { drivePath, armSimulators } from '/home/user/Tisaic.github.io/lib/flexisim/twin.js';
import { randomWander } from '/home/user/Tisaic.github.io/lib/flexisim/demopath.js';
import { Joint } from '/home/user/Tisaic.github.io/lib/flexisim/joint.js';
import { FlexArm2R } from '/home/user/Tisaic.github.io/lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '/home/user/Tisaic.github.io/lib/flexisim/link.js';
import { ChainServo } from '/home/user/Tisaic.github.io/lib/flexisim/compensator.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, homeArm } = rig;
const SS = 9;
const mkRnd = (s) => { let z = s >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
const H4 = 4, CLAMP = 3, NU = 0.3, G = 2e-6, RATIO = 100;
const buildAt = async (P) => {
  const mk = (length) => buildLink({ length, section: H4, clamp: CLAMP, E: P.E,
    nu: NU, rho: 1, damping: P.damp });
  const l1 = await mk(14), l2 = await mk(10);
  const j = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: P.K, backlash: P.bl,
    damping: 2 * Math.sqrt(P.K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: j(massProperties(l1)), link1: l1,
    joint2: j(massProperties(l2)), link2: l2, gravityWorld: [0, -G, 0], dt: 1 });
  const hold = Math.abs(arm.gravityTorque([0, 0])[0]) / RATIO;
  const servo = new ChainServo({ arm, bandwidth: 2e-3, tauMax: 32 * hold, speedMax: 0.2 });
  return { arm, servo };
};
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const wpath = randomWander(mkRnd(301), 0.004, { centre: [12, 0], reach: 6 });
console.log('recording…');
const real = await makeArm();
homeArm(real.arm, real.servo, wpath);
const { e: record } = await drivePath({ arm: real.arm, servo: real.servo, path: wpath,
  sample: SS, steps: 1500 * SS });
await destroy(real);
const evalAt = async (Q) => {
  const m = await buildAt(Q);
  try {
    homeArm(m.arm, m.servo, wpath);
    const { e } = await drivePath({ arm: m.arm, servo: m.servo, path: wpath,
      sample: SS, steps: 1500 * SS });
    let s = 0;
    for (let i = 0; i < record.length; i++) s += (e[i][0] - record[i][0]) ** 2 + (e[i][1] - record[i][1]) ** 2;
    return s / record.length;
  } catch { return Infinity; } finally { await destroy(m); }
};
let P = { K: 0.2480, E: 0.02977, damp: 3.00e-3, bl: 1.67e-5 };
let J = await evalAt(P);
console.log(`start J ${J.toExponential(3)}`);
for (const f of [1.04, 1.02, 1.01]) {
  for (const k of ['K', 'E', 'damp', 'bl']) {
    for (const dir of [f, 1 / f]) {
      const Q = { ...P, [k]: P[k] * dir };
      const jq = await evalAt(Q);
      const keep = jq < J;
      console.log(`  ${k} ${Q[k].toExponential(4)}: J ${jq.toExponential(3)} ${keep ? 'KEEP' : ''}`);
      if (keep) { P = Q; J = jq; }
    }
  }
}
console.log(`TIGHTENED: K=${P.K.toExponential(4)} E=${P.E.toExponential(4)} damp=${P.damp.toExponential(3)} bl=${P.bl.toExponential(2)}  J=${J.toExponential(3)}`);
console.log('truth    : K=2.5e-1 E=3.0e-2 damp=3e-3 bl=1e-4');
console.log('EXIT 0');
