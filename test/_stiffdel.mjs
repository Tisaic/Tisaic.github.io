// DOES THE STIFF CELL'S 30%-LOW K COST DELIVERY? The staged identification at K=16
// recovered E to 0.2% and damping to 4% and left K at 11.18 — K's output-error
// signal scales as 1/K, so it is weakly observable exactly where it is stiffest.
// The number that decides whether that is a defect: compile through the FITTED twin,
// deliver on the TRUE machine, beside the oracle compile at truth params.
import { compileTwin, refineCompiled } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
import { drivePath, twinResponse, armSimulators } from '/home/user/Tisaic.github.io/lib/flexisim/twin.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, mkPath, homeArm } = rig;
const SS = 9, PRE = 1500;
const TRUE_P = { K: 16, E: 0.15 };
const FIT_P = { K: 11.18, E: 0.1497, damp: 3.12e-3, bl: 8.03e-8 };
const path = mkPath('rounded', 0.004);
const destroyArm = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const home = async (m, p) => homeArm(m.arm, m.servo, p);

const compileAt = async (params, label) => {
  const buildArm = () => makeArm(params);
  const sims = armSimulators({ buildArm, destroyArm, home, sample: SS });
  const H = await twinResponse({ buildArm, destroyArm, path, sample: SS });
  const res = await compileTwin({ simulate: sims.compileSim(path, { laps: 5, preRoll: PRE }), H, iters: 11 });
  const ref = await refineCompiled({ simulate: sims.compileSim(path, { laps: 4, preRoll: PRE }),
    H, du: res.du, sample: SS, lapSteps: path.lap, preRoll: PRE });
  console.log(`${label}: compiled ${res.report.rms.toExponential(2)}, refined ${ref.report.rms.toExponential(3)}`);
  return ref.f;
};
const deliver = async (duF, laps) => {
  const m = await makeArm(TRUE_P);
  homeArm(m.arm, m.servo, path);
  const out = await drivePath({ arm: m.arm, servo: m.servo, path, sample: SS,
    steps: Math.ceil(path.lap * laps), du: duF, preRoll: duF ? PRE : 0 });
  await destroyArm(m);
  return out.perLap.map((p) => Math.hypot(p[0], p[1]));
};

const fFit = await compileAt(FIT_P, 'fitted (K 30% low)');
const fOracle = await compileAt(TRUE_P, 'oracle (truth params)');
const open = await deliver(null, 2);
const gotFit = await deliver(fFit, 8);
const gotOr = await deliver(fOracle, 8);
console.log('open  :', open.map((v) => v.toExponential(1)).join(' '));
console.log('fitted:', gotFit.map((v) => v.toExponential(1)).join(' '));
console.log('oracle:', gotOr.map((v) => v.toExponential(1)).join(' '));
console.log(`lap 1: fitted ${gotFit[0].toExponential(2)} vs oracle ${gotOr[0].toExponential(2)} vs open ${open.at(-1).toExponential(2)}`);
console.log(`tail : fitted ${gotFit.at(-1).toExponential(2)} vs oracle ${gotOr.at(-1).toExponential(2)}  (fitted/oracle ${(gotFit.at(-1) / gotOr.at(-1)).toFixed(2)}x)`);
console.log('EXIT 0');
