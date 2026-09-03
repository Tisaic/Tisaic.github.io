// B's closing measurement: the 4-parameter-FITTED lattice template compiles the
// canonical program and delivers on the TRUE machine. Fitted: K=0.2480 E=0.02977
// damp=3.00e-3 bl=1.67e-5 (truth 0.25/0.03/3e-3/1e-4, J=1.5e-6).
import { compileTwin, refineCompiled } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
import { twinResponse, armSimulators } from '/home/user/Tisaic.github.io/lib/flexisim/twin.js';
import { Joint } from '/home/user/Tisaic.github.io/lib/flexisim/joint.js';
import { FlexArm2R } from '/home/user/Tisaic.github.io/lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '/home/user/Tisaic.github.io/lib/flexisim/link.js';
import { ChainServo } from '/home/user/Tisaic.github.io/lib/flexisim/compensator.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, mkPath, homeArm } = rig;
const SS = 9, PRE = 1500, LAPS = 8;
const FIT = { K: 0.24800, E: 0.030065, damp: 2.970e-3, bl: 1.64e-5 };
const path = mkPath('sharp', 0.004);
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const H4 = 4, CLAMP = 3, NU = 0.3, G = 2e-6, RATIO = 100;
const buildFitted = async () => {
  const mk = (length) => buildLink({ length, section: H4, clamp: CLAMP, E: FIT.E,
    nu: NU, rho: 1, damping: FIT.damp });
  const l1 = await mk(14), l2 = await mk(10);
  const j = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: FIT.K, backlash: FIT.bl,
    damping: 2 * Math.sqrt(FIT.K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: j(massProperties(l1)), link1: l1,
    joint2: j(massProperties(l2)), link2: l2, gravityWorld: [0, -G, 0], dt: 1 });
  const hold = Math.abs(arm.gravityTorque([0, 0])[0]) / RATIO;
  const servo = new ChainServo({ arm, bandwidth: 2e-3, tauMax: 32 * hold, speedMax: 0.2 });
  return { arm, servo };
};
const home = async (m, p) => homeArm(m.arm, m.servo, p);
const sims = armSimulators({ buildArm: buildFitted, destroyArm: destroy, home, sample: SS });
console.log('probe + compile on the FITTED template…');
const H = await twinResponse({ buildArm: buildFitted, destroyArm: destroy, path, sample: SS });
const res = await compileTwin({ simulate: sims.compileSim(path, { laps: 5, preRoll: PRE }),
  H, iters: 11, onProgress: (m) => console.log('  ' + m) });
const ref = await refineCompiled({ simulate: sims.compileSim(path, { laps: 4, preRoll: PRE }),
  H, du: res.du, sample: SS, lapSteps: path.lap, preRoll: PRE,
  onProgress: (m) => console.log('  ' + m) });
console.log(`compiled ${res.report.rms.toExponential(2)}, refined ${ref.report.rms.toExponential(2)}`);
// deliver on the TRUE machine
const drive = async (duF, laps) => {
  const m = await makeArm();
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
const open = await drive(null, 2);
const got = await drive(ref.f, LAPS);
console.log('open  :', open.map((v) => v.toExponential(2)).join('  '));
console.log('fitted:', got.map((v) => v.toExponential(2)).join('  '));
console.log(`gain over open: ${(open.at(-1) / got.at(-1)).toFixed(1)}x`);
console.log('EXIT 0');
