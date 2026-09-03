
// CAN A CHEAP MODEL INHERIT THE TWIN'S MEMORY? — the experiment the owner's live
// architecture turns on (plan §46).
//
// Measured already: the twin's forecast beats the pilot's fitted one by 68-489x and is
// FLAT in lead, so the pilot's bound is the lag-window regression class and not the
// problem. But the twin gets that by SIMULATING, and the simulation runs 5.4x slower
// than real time (plan §44) — inadmissible live under the PLC rule. The architecture
// therefore needs a model that is cheap to evaluate AND carries the twin's memory.
//
// WHY THIS MIGHT WORK NOW WHEN ROUTE A FAILED. §43's learners were fitted on MACHINE
// records: one wander, limited length, and closed paths that ALIAS (§41). Fitted on the
// TWIN instead, the training data is unlimited, the excitation is whatever we choose,
// the paths need never close, and the window can be made to REACH the measured
// 6363-8649-step memory (rule 37) instead of truncating it at 384.
//
// THE MODEL IS DELIBERATELY THE CHEAPEST THING THAT COULD WORK: a linear readout over a
// LOG-SPACED lag window reaching 768 samples (~6900 steps), so it costs ~200 terms where a
// dense window of that reach would need thousands.
//
// IT SEES WHAT THE PILOT SEES AT DEPLOY, WHICH IS NOT THE COMMAND ALONE. The first version
// of this bench gave it command-derived signals only and measured 0.901/-0.177 on the
// rounded rectangle and 0.844/-1.329 on the circle — but that was a bench flaw rather than
// a finding: `routeSignals` hands the pilot [encoder angles, encoder speeds, applied
// torques], every one of them available at deploy. Only `truth` (the tool position) comes
// from the TRACKER and is commissioning-only. "Remove the tracker" therefore permits
// encoder and torque feedback, and a model denied them is blinder than the architecture
// requires (rule 20: matched capacity, or the comparison measures the handicap).
//
// READ IT AS: fitted-on-machine (the pilot today) vs fitted-on-twin-with-reach (this)
// vs the twin itself (1.000). If this closes most of the gap, the live architecture has
// its model. If it walls where route A walled, the twin's advantage is irreducibly its
// nonlinear state propagation and live use means running the simulation.
import { solveRidge } from '/home/user/Tisaic.github.io/lib/pilot/pilot.js';
import { drivePath } from '/home/user/Tisaic.github.io/lib/flexisim/twin.js';
import { randomWander } from '/home/user/Tisaic.github.io/lib/flexisim/demopath.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, mkPath, homeArm, routeSignals } = rig;
const SS = 9;
// the twin at its LM-FITTED parameters (twin.test.mjs phase 4 on this cell), never truth
const TWIN_FIT = { K: 0.9993, E: 0.05997, damp: 3.00e-3, bl: 6.08e-5 };
const LAGS = [0,1,2,3,4,6,8,12,16,24,32,48,64,96,128,192,256,384,512,768];
const REACH = LAGS.at(-1);
console.log(`lag window reaches ${REACH} samples = ${REACH * SS} steps `
  + `(measured elbow memory 6363-8649 steps)`);

const mkRnd = (s) => { let z = s >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };

// record command + truth over a path, on whichever machine is asked for
const record = async (params, path, laps) => {
  const m = await makeArm(params);
  homeArm(m.arm, m.servo, path);
  const cmd = [], mea = [], e = [];
  const total = Math.ceil(path.lap * laps);
  for (let k = 0; k < total; k++) {
    const c = path.at(k);
    const [q1, q2] = m.arm.ik(c.x, c.y, true);
    const rt = m.arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    const tau = m.servo.torques([{ theta: q1, omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2, omega: rt.dq[1], alpha: rt.ddq[1] }]);
    m.arm.step(tau[0], tau[1], 1);
    if (k % SS === 0) {
      const r = routeSignals(m.arm, [{ pos: q1 }, { pos: q2 }], tau);
      cmd.push([q1, q2]); mea.push(r.measured); e.push(r.truth);
    }
  }
  await destroy(m);
  return { cmd, mea, e };
};

// features at sample k: command AND the six DEPLOY-TIME measured signals (encoders and
// torques — never the tracker), at log-spaced lags back to the measured memory
const featAt = (cmd, mea, k) => {
  const f = [1];
  for (const L of LAGS) {
    const i = Math.max(0, k - L), j = Math.max(0, k - L - 1);
    f.push(cmd[i][0], cmd[i][1], cmd[i][0] - cmd[j][0], cmd[i][1] - cmd[j][1]);
    for (let c = 0; c < 6; c++) f.push(mea[i][c]);
  }
  return f;
};

// TRAINING DATA FROM THE TWIN: open wanders, unlimited, never closed so nothing aliases
console.log('generating training data from the twin (open wanders)…');
const rows = [], ys = [[], []];
const NTRAIN = +(process.env.RED_TRAIN || 5);
for (let i = 0; i < NTRAIN; i++) {
  const w = randomWander(mkRnd(2000 + i), 0.004, { centre: [12, 0], reach: 6 });
  const r = await record(TWIN_FIT, w, 1);
  for (let k = REACH; k < r.e.length; k++) {
    rows.push(featAt(r.cmd, r.mea, k));
    ys[0].push(r.e[k][0]); ys[1].push(r.e[k][1]);
  }
  console.log(`  wander ${i + 1}/${NTRAIN}: ${r.e.length} samples (${rows.length} rows total)`);
}
const nF = rows[0].length;
console.log(`fitting ${nF} terms on ${rows.length} rows…`);
const W = [0, 1].map((c) => solveRidge(rows, ys[c], 1e-6));

// SCORE ON THE TRUE MACHINE, on the same held-out programs as the twin-vs-fitted table
console.log(`\n  ${'program'.padEnd(16)} ${'ch'.padStart(3)} ${'R2'.padStart(8)}`
  + ` ${'resid rms'.padStart(11)} ${'truth rms'.padStart(11)}   vs pilot-fitted / twin`);
const REF = { rounded: [0.980, 0.896], circle: [0.981, 0.909], sharp: [0.919, 0.402] };
for (const shape of ['rounded', 'circle', 'sharp']) {
  const path = mkPath(shape, 0.004);
  const truth = await record(undefined, path, 3);
  for (let c = 0; c < 2; c++) {
    let sse = 0, n = 0, sy = 0, sy2 = 0;
    for (let k = Math.max(REACH, Math.round(path.lap / SS)); k < truth.e.length; k++) {
      const f = featAt(truth.cmd, truth.mea, k);
      let p = 0;
      for (let i = 0; i < nF; i++) p += W[c][i] * f[i];
      const y = truth.e[k][c];
      sse += (y - p) ** 2; sy += y; sy2 += y * y; n++;
    }
    const varY = sy2 / n - (sy / n) ** 2;
    const r2 = 1 - (sse / n) / Math.max(varY, 1e-300);
    console.log(`  ${shape.padEnd(16)} ${String(c).padStart(3)} ${r2.toFixed(3).padStart(8)}`
      + ` ${Math.sqrt(sse / n).toExponential(2).padStart(11)}`
      + ` ${Math.sqrt(varY).toExponential(2).padStart(11)}`
      + `   pilot ${REF[shape][c].toFixed(3)} / twin 1.000`);
  }
}
console.log('EXIT 0');
