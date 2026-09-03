// THE LIB PATH, END TO END (rule 61): the 53.6x was measured by a bench chain
// (refineCompiled → joint-space operator cycles → tool-space cycles, warm-started).
// What ships is ONE call: refineCompiled → refineOperator(project: toolProjection),
// tool-space from cold — unmeasured until this run. If the lib path lands >= 50x the
// promotion is validated on the machine; if it falls short, the host chains a
// joint-space pass first and that is what gets documented.
import { compileTwin, refineCompiled, refineOperator } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
import { twinResponse, armSimulators, toolProjection } from '/home/user/Tisaic.github.io/lib/flexisim/twin.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, mkPath, homeArm } = rig;
const SS = 9, PRE = 1500;
const path = mkPath('circle', 0.004);
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const home = async (m, p) => homeArm(m.arm, m.servo, p);
const sims = armSimulators({ buildArm: () => makeArm(), destroyArm: destroy, home, sample: SS });

console.log('probe + compile + shipped refine…');
const H = await twinResponse({ buildArm: () => makeArm(), destroyArm: destroy, path, sample: SS });
const res = await compileTwin({ simulate: sims.compileSim(path, { laps: 5, preRoll: PRE }), H, iters: 11 });
const ref = await refineCompiled({ simulate: sims.compileSim(path, { laps: 4, preRoll: PRE }),
  H, du: res.du, sample: SS, lapSteps: path.lap, preRoll: PRE });
console.log(`refined ${ref.report.rms.toExponential(3)}`);

const project = await toolProjection({ buildArm: () => makeArm(), destroyArm: destroy, path });
const op = await refineOperator({ simulate: sims.compileSim(path, { laps: 4, preRoll: PRE }),
  f: ref.f, sample: SS, lapSteps: path.lap, preRoll: PRE,
  cycles: 4, steps: 5, project, onProgress: (m) => console.log('  ' + m) });
console.log(`operator refine: rms0 ${op.report.rms0.toExponential(3)} -> ${op.report.rms.toExponential(3)}  duPk ${op.report.duPk.toFixed(2)}  evals ${op.report.evals}`);

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
const got = await score(op.f, 8);
console.log('open:', open.map((v) => v.toExponential(2)).join('  '));
console.log('lib :', got.map((v) => v.toExponential(2)).join('  '));
console.log(`gain over open: ${(open.at(-1) / got.at(-1)).toFixed(1)}x   (bench chain measured 53.6x, refineCompiled alone 44.0x)`);
console.log('EXIT 0');
