// THE BACKLASH HYPOTHESIS: six refinement schemes stall at the same 3.1-3.2e-3 tile.
// Backlash is a DEAD ZONE — within the band the machine ignores a small du — so at
// crossing phases the residual would be uncorrectable by any small command-side change,
// which produces exactly the shared-wall signature (and a zero gradient). Decisive
// test: the identical shipped pipeline on a BACKLASH-FREE machine at otherwise
// canonical params. Tile well below 3.1e-3 => the wall is the backlash, physical, and
// the null-chain closes with a cause; tile unchanged => backlash is exonerated.
import { compileTwin, refineCompiled, applyCompiled } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
import { twinResponse, armSimulators } from '/home/user/Tisaic.github.io/lib/flexisim/twin.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, mkPath, homeArm } = rig;
const SS = 9, PRE = 1500;
const BL = process.env.NOBL_BL === undefined ? 0 : +process.env.NOBL_BL;
const path = mkPath('sharp', 0.004);
const mk = () => makeArm({ bl: BL });
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const home = async (m, p) => homeArm(m.arm, m.servo, p);
const sims = armSimulators({ buildArm: mk, destroyArm: destroy, home, sample: SS });

console.log(`pipeline with bl=${BL} (canonical otherwise)…`);
const H = await twinResponse({ buildArm: mk, destroyArm: destroy, path, sample: SS });
const res = await compileTwin({ simulate: sims.compileSim(path, { laps: 5, preRoll: PRE }), H, iters: 11 });
console.log(`compiled ${res.report.rms.toExponential(2)}   (bl>0 shipped: 5.90e-3)`);
const ref = await refineCompiled({ simulate: sims.compileSim(path, { laps: 4, preRoll: PRE }),
  H, du: res.du, sample: SS, lapSteps: path.lap, preRoll: PRE });
console.log(`refined ${ref.report.rms.toExponential(3)}   (bl>0 shipped: 3.12e-3, repeatability floor ~4.3e-4)`);

// 8-lap delivery on the same (bl-free) machine, contour vs its own open loop
const score = async (duF, laps) => {
  const m = await mk();
  homeArm(m.arm, m.servo, path);
  if (duF) {
    const c0 = path.at(0);
    const [q1h, q2h] = m.arm.ik(c0.x, c0.y, true);
    for (let k = 0; k < PRE * SS; k++) {
      const d = duF(k);
      const tau = m.servo.torques([{ theta: q1h + d[0], omega: 0, alpha: 0 },
        { theta: q2h + d[1], omega: 0, alpha: 0 }]);
      m.arm.step(tau[0], tau[1], 1);
    }
  }
  const total = Math.ceil(path.lap * laps);
  const rows = []; let cAcc = 0, cn = 0, lapNo = 0;
  for (let k = 0; k < total; k++) {
    const now = Math.floor(k / path.lap);
    if (now !== lapNo) { rows.push(Math.sqrt(cAcc / cn)); cAcc = 0; cn = 0; lapNo = now; }
    const c = path.at(k);
    const [q1, q2] = m.arm.ik(c.x, c.y, true);
    const rt = m.arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    const d = duF ? duF(PRE * SS + k) : [0, 0];
    const tau = m.servo.torques([{ theta: q1 + d[0], omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2 + d[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
    m.arm.step(tau[0], tau[1], 1);
    if (k % SS === 0) {
      const tool = m.arm.toolXY();
      const sp = Math.hypot(c.vx, c.vy) || 1;
      const cerr = (c.vx / sp) * (tool[1] - c.y) - (c.vy / sp) * (tool[0] - c.x);
      cAcc += cerr * cerr; cn++;
    }
  }
  if (cn > 10) rows.push(Math.sqrt(cAcc / cn));
  await destroy(m);
  return rows;
};
const open = await score(null, 2);
const got = await score(ref.f, 6);
console.log('open:', open.map((v) => v.toExponential(2)).join('  '));
console.log('twin:', got.map((v) => v.toExponential(2)).join('  '));
console.log(`gain over open: ${(open.at(-1) / got.at(-1)).toFixed(1)}x   (bl>0 shipped: 44.0x)`);
console.log('EXIT 0');
