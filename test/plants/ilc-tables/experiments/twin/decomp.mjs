// WHERE THE ERROR PHYSICALLY COMES FROM, in joint coordinates, over one lap of the untouched machine:
//   total = bending (tool vs the rigid arm at its load angles) + wind-up (load vs motor)
//         + motor tracking (motor vs the servo's setpoint) + the compliance shift the controller adds
import { buildArm, calibrateComp, ikOf, benchProgram, BENCH } from '../../../../../lib/flexisim/bench.js';
import { driveTo } from '../../../../../lib/flexisim/approach.js';
for (const [sh, f] of [['circle', 3e-3], ['sharp', 3e-3], ['sharp', 1e-3]]) {
  const m = await buildArm(), ik = ikOf(m.arm.L1, m.arm.L2), rc = await calibrateComp(m), prog = benchProgram(sh, f, ik), L = prog.lap;
  await driveTo(m.arm, m.servo, prog.at(0), BENCH.feed);
  let p1 = prog.at(-1), w1 = [prog.at(-1)[0] - prog.at(-2)[0], prog.at(-1)[1] - prog.at(-2)[1]];
  const J = [[1, 0], [0, 1]], acc = { total: [0, 0], bend: [0, 0], wind: [0, 0], motor: [0, 0], shift: [0, 0], check: [0, 0] };
  for (let lap = 0; lap < 2; lap++) for (let k = 0; k < L; k++) {
    const sp = prog.at(k), w = [sp[0] - p1[0], sp[1] - p1[1]];
    const refs = [{ theta: sp[0], omega: w[0], alpha: w[0] - w1[0] }, { theta: sp[1], omega: w[1], alpha: w[1] - w1[1] }];
    const dq = rc.feedforward(J, m.servo.jointTorques(refs), { enableToolff: false }).dq;
    const tau = m.servo.torques([{ ...refs[0], theta: sp[0] + dq[0] }, { ...refs[1], theta: sp[1] + dq[1] }]);
    m.arm.step(tau[0], tau[1], 1); p1 = sp; w1 = w;
    if (lap === 0) continue;
    const t = m.arm.toolXY(), tr = m.arm.toolXY(true), y = ik(t[0], t[1]), yr = ik(tr[0], tr[1]);
    const enc = m.arm.encoders(), thL = [m.arm.j1.thL, m.arm.j2.thL];
    for (let c = 0; c < 2; c++) {
      const total = y[c] - sp[c], bend = y[c] - yr[c], fk = yr[c] - thL[c], wind = thL[c] - enc[c].angle, motor = enc[c].angle - (sp[c] + dq[c]);
      acc.total[c] += total ** 2; acc.bend[c] += bend ** 2; acc.wind[c] += wind ** 2; acc.motor[c] += motor ** 2; acc.shift[c] += dq[c] ** 2;
      acc.check[c] += (total - (bend + fk + wind + motor + dq[c])) ** 2;
    }
  }
  const r = (x) => x.map((v) => Math.sqrt(v / L).toExponential(2)).join('/');
  console.log(`${sh} ${f}: rms per joint — total ${r(acc.total)} · link bending ${r(acc.bend)} · gearbox wind-up ${r(acc.wind)} · motor tracking ${r(acc.motor)} · compliance shift ${r(acc.shift)} · (sum check ${r(acc.check)})`);
  await m.l1.destroy(); await m.l2.destroy();
}
