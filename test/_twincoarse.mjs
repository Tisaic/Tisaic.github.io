// THE RESOLUTION LEVER FOR THE PLC-ONLY DIRECTIVE (plan §44): a section-3 twin has
// 44% fewer material cells than the section-4 machine it models. If it identifies and
// delivers within the shipped class, the sliced-into-the-scan pipeline gets ~1.8x
// faster. The coarse template refits its OWN four parameters (rule 31 — the fitted
// constants absorb what they can of the resolution mismatch), probes its own H,
// compiles and refines through itself, and is scored on the TRUE section-4 machine at
// the canonical cell. The bar it is measured against: the shipped 44.0x.
import { identifyTwin, refineParams, compileTwin, refineCompiled } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
import { drivePath, twinResponse, armSimulators } from '/home/user/Tisaic.github.io/lib/flexisim/twin.js';
import { randomWander } from '/home/user/Tisaic.github.io/lib/flexisim/demopath.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, mkPath, homeArm } = rig;
const SS = 9, PRE = 1500;
const SEC = +(process.env.COARSE_SEC || 3);
const path = mkPath('sharp', 0.004);
const mkRnd = (s) => { let z = s >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
const wpath = randomWander(mkRnd(301), 0.004, { centre: [12, 0], reach: 6 });
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const home = async (m, p) => homeArm(m.arm, m.servo, p);

console.log(`coarse twin at section ${SEC} against the true section-4 machine (canonical cell)…`);
console.log('recording the true machine (900-sample wander)…');
const m0 = await makeArm();
homeArm(m0.arm, m0.servo, wpath);
const rec = await drivePath({ arm: m0.arm, servo: m0.servo, path: wpath, sample: SS, steps: 900 * SS });
await destroy(m0);

const coarseBuild = async (p) => makeArm({ ...(p || {}), section: SEC });
const idSims = armSimulators({ buildArm: coarseBuild, destroyArm: destroy, home, sample: SS });
const idSim = idSims.identifySim(wpath, 900);
const grid = await identifyTwin({
  record: rec.e,
  simulate: (p) => idSim({ ...p, damp: 1e-3, bl: 0 }),
  space: [
    { name: 'K', values: [0.1, 0.18, 0.25, 0.35, 0.5, 1, 2] },
    { name: 'E', values: [0.015, 0.03, 0.06, 0.10, 0.15] },
  ],
  refine: 2,
});
console.log(`grid: K=${grid.params.K.toPrecision(4)} E=${grid.params.E.toPrecision(4)} J=${grid.J.toExponential(2)}`);
const fit = await refineParams({
  record: rec.e,
  simulate: idSim,
  params: { K: grid.params.K, E: grid.params.E, damp: 1e-3, bl: 5e-5 },
  keys: [{ name: 'damp', factor: 3 }, { name: 'bl', factor: 3 },
    { name: 'K', factor: 1.15 }, { name: 'E', factor: 1.08 }],
  rounds: 2, shrink: [1.04],
});
console.log(`coarse twin fitted: K=${fit.params.K.toPrecision(4)} E=${fit.params.E.toPrecision(4)} `
  + `damp=${fit.params.damp.toExponential(2)} bl=${fit.params.bl.toExponential(2)} J=${fit.J.toExponential(2)}`
  + `  (true machine 0.25/0.03/3e-3 at section 4 — the fitted numbers may lawfully differ, they belong to the coarse template)`);

const twinAt = { ...fit.params, section: SEC };
const twinBuild = () => makeArm(twinAt);
const sims = armSimulators({ buildArm: twinBuild, destroyArm: destroy, home, sample: SS });
const H = await twinResponse({ buildArm: twinBuild, destroyArm: destroy, path, sample: SS });
const res = await compileTwin({ simulate: sims.compileSim(path, { laps: 5, preRoll: PRE }), H, iters: 11 });
console.log(`compiled ${res.report.rms.toExponential(2)} (sim, coarse twin)`);
const ref = await refineCompiled({ simulate: sims.compileSim(path, { laps: 4, preRoll: PRE }),
  H, du: res.du, sample: SS, lapSteps: path.lap, preRoll: PRE });
console.log(`refined ${ref.report.rms.toExponential(3)} (sim, coarse twin; fine-twin class 3.12e-3)`);

const score = async (duF, laps) => {
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
const open = await score(null, 2);
const got = await score(ref.f, 8);
console.log('open  :', open.map((v) => v.toExponential(2)).join('  '));
console.log('coarse:', got.map((v) => v.toExponential(2)).join('  '));
console.log(`gain over open: ${(open.at(-1) / got.at(-1)).toFixed(1)}x   (fine twin ships 44.0x; the PLC pays 44% fewer cells at section 3)`);
console.log('EXIT 0');
