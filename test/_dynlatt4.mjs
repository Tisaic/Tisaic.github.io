// B COMPLETED: the LATTICE-CLASS template with MORE parameters freed. The engineer
// declares "2R chain, slender elastic beam links" — the same epistemic status as
// "rigid links + springs" — and output error fits K, E, LINK DAMPING and BACKLASH
// (previously known constants). Does the identification stay sharp with 4 dims?
// Staged: the proven K/E grid first, then coordinate refinement over all four.
import { identifyTwin } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
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

// the template constructor: geometry/ratio/drive nameplate, EVERYTHING else fitted
const H4 = 4, CLAMP = 3, NU = 0.3, RHO = 1, G = 2e-6, RATIO = 100;
const NAME = { LEN1: 14, LEN2: 10, drive: 32 };
const buildAt = async (P) => {
  const mk = (length) => buildLink({ length, section: H4, clamp: CLAMP, E: P.E,
    nu: NU, rho: RHO, damping: P.damp });
  const l1 = await mk(NAME.LEN1), l2 = await mk(NAME.LEN2);
  const j = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: P.K, backlash: P.bl,
    damping: 2 * Math.sqrt(P.K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: j(massProperties(l1)), link1: l1,
    joint2: j(massProperties(l2)), link2: l2, gravityWorld: [0, -G, 0], dt: 1 });
  const hold = Math.abs(arm.gravityTorque([0, 0])[0]) / RATIO;
  const servo = new ChainServo({ arm, bandwidth: 2e-3,
    tauMax: NAME.drive * hold, speedMax: 0.2 });
  return { arm, servo };
};
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const home = async (m, p) => homeArm(m.arm, m.servo, p);

const wpath = randomWander(mkRnd(301), 0.004, { centre: [12, 0] });
console.log('recording the wander on the true machine (K=0.25 E=0.03 damp=3e-3 bl=1e-4)…');
const real = await makeArm();
homeArm(real.arm, real.servo, wpath);
const { e: record } = await drivePath({ arm: real.arm, servo: real.servo, path: wpath,
  sample: SS, steps: 900 * SS });
await destroy(real);

// stage 1: the proven K/E grid at NOMINAL damp/backlash guesses
const sims1 = armSimulators({
  buildArm: (p) => buildAt({ K: p ? p.K : 0.25, E: p ? p.E : 0.03, damp: 1e-3, bl: 0 }),
  destroyArm: destroy, home, sample: SS });
console.log('stage 1: K/E grid with damp/backlash at crude guesses (1e-3, 0)…');
const fit1 = await identifyTwin({
  record, simulate: sims1.identifySim(wpath, 900),
  space: [
    { name: 'K', values: [0.25, 0.5, 1, 2, 4, 8, 16] },
    { name: 'E', values: [0.03, 0.06, 0.10, 0.15] },
  ],
  refine: 2,
  onProgress: (m) => console.log('  ' + m),
});
console.log(`stage 1: K=${fit1.params.K} E=${fit1.params.E} J=${fit1.J.toExponential(2)}`);

// stage 2: coordinate refinement over all four (log steps, few rounds — each eval is
// a lattice replay, so parsimony matters)
let P = { K: fit1.params.K, E: fit1.params.E, damp: 1e-3, bl: 5e-5 };
const evalAt = async (Q) => {
  const m = await buildAt(Q);
  try {
    await home(m, wpath);
    const { e } = await drivePath({ arm: m.arm, servo: m.servo, path: wpath,
      sample: SS, steps: 900 * SS });
    let s = 0;
    for (let i = 0; i < record.length; i++) s += (e[i][0] - record[i][0]) ** 2 + (e[i][1] - record[i][1]) ** 2;
    return s / record.length;
  } catch { return Infinity; } finally { await destroy(m); }
};
let J = await evalAt(P);
console.log(`stage 2 start: J ${J.toExponential(3)} at damp 1e-3 bl 5e-5`);
for (let round = 0; round < 3; round++) {
  for (const [k, f] of [['damp', 3], ['bl', 3], ['K', 1.15], ['E', 1.08]]) {
    for (const dir of [f, 1 / f]) {
      const Q = { ...P, [k]: P[k] * dir };
      const jq = await evalAt(Q);
      console.log(`  ${k} ${Q[k].toExponential(2)}: J ${jq.toExponential(3)} ${jq < J ? 'KEEP' : ''}`);
      if (jq < J) { P = Q; J = jq; }
    }
  }
}
console.log(`FITTED: K=${P.K.toExponential(3)} E=${P.E.toExponential(3)} damp=${P.damp.toExponential(2)} bl=${P.bl.toExponential(2)}  J=${J.toExponential(3)}`);
console.log('truth : K=2.5e-1 E=3.0e-2 damp=3e-3 bl=1e-4');
console.log('EXIT 0');
