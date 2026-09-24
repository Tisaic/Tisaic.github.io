/**
 * @file The compliant 2R arm on the bench cell — the FlexiSim page's machine (`lib/flexisim/bench.js`).
 *
 * Two lattice-elastic links on geared joints with backlash, a joint servo and the conventional
 * compliance feedforward. The block trims the two JOINT setpoints; the measurement is the tool's
 * achieved position mapped back to joints through the arm's own inverse kinematics — a tracker,
 * which is a commissioning instrument. Main program: the sharp square at the bench feed; held out:
 * the circle. It is asynchronous (the links are built by the lattice engine) and slow, about
 * 180 µs a scan in Node, so it runs in the full tier only.
 */
import { buildArm, calibrateComp, benchProgram, ikOf, conventional, BENCH } from '../../lib/flexisim/bench.js';
import { driveTo } from '../../lib/flexisim/approach.js';

// The link lengths are fixed by the bench geometry, so one probe arm fixes the programs.
const probe = await buildArm();
const ik = ikOf(probe.arm.L1, probe.arm.L2);
await probe.l1.destroy(); await probe.l2.destroy();

async function make(prog) {
  const m = await buildArm();
  const rc = await calibrateComp(m);
  await driveTo(m.arm, m.servo, prog.at(0), BENCH.feed);
  const c = conventional(m, rc);
  c.reset(prog.at(0));
  for (let k = 0; k < prog.lap; k++) c.step(prog.at(k));   // one lap to settle onto the program
  return {
    meas: (o) => { const t = m.arm.toolXY(), q = ik(t[0], t[1]); o[0] = q[0]; o[1] = q[1]; },
    step: (sp) => { c.step(sp); },
  };
}

export const arm2r = {
  key: 'arm2r', name: 'compliant 2R arm, bench cell (K 0.25 / E 0.03)', units: 'rad', nc: 2, dt: 1e-3,
  main: benchProgram('sharp', BENCH.feed, ik),
  heldOut: benchProgram('circle', BENCH.feed, ik),
  make, slow: true,
  about: 'the FlexiSim machine: link bend and gearbox wind-up the joint servo cannot see',
};
