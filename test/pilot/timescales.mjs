/**
 * Not a test — WHAT SETS THE 951-STEP RISE, AND IS THIS PLANT A MACHINE? (plan §52.28).
 *
 * §52.26.5 measured the tool error's rise at 951 steps through the position command and 948
 * through a torque step at the motor, read the agreement as "the gearbox spring is the plant's
 * low-pass, not the loop", and closed the whole feedback route on it. That reading has a
 * structural fault of exactly the kind rule 15 names: BOTH PATHS RUN THROUGH THE CLOSED LOOP.
 * `stepresp.mjs` adds its torque step on top of `servo.torques(...)`, so the PD sees the motor
 * move and pushes back, and the settling of both is set by the same closed-loop poles. Two
 * measurements through one loop cannot check each other.
 *
 * This asks the three questions that separates them, and none of them needs a controller:
 *
 *  1. THE MODE TABLE. The plant's own timescales — the position loop's designed bandwidth, the
 *     gearbox two-mass resonance, and each link's first bending mode — computed from the
 *     constants the machine was built from, at a ladder of cells. A machine is a plant whose
 *     structural modes are WELL ABOVE its position loop; `ChainServo`'s own docstring says so.
 *  2. THE BANDWIDTH SWEEP. The same step response at a ladder of servo bandwidths. If the rise
 *     tracks 1/bw the LOOP sets it and §52.26.5's conclusion is inverted; if it floors, that
 *     floor is the mechanics and the conclusion stands.
 *  3. THE AUTHORITY INSIDE THE HORIZON. From the same record: what fraction of the settled
 *     response is delivered by the end of the pilot's horizon (N·grid steps). The QP inverts
 *     `hGrid` over exactly that window, so a response still near zero there is an inversion with
 *     no authority over its own decision — the mill's fault (a 14-step horizon on a plant that
 *     cannot move for 100), never checked on the arm.
 */
import { machine, settle } from '../flexisim/_rig.mjs';
import { ChainServo } from '../../lib/flexisim/compensator.js';

const CELLS = (process.env.CELLS || '0.25/0.03,16/0.15,64/0.6').split(',').map((s) => {
  const [K, E] = s.split('/').map(Number); return { K, E };
});
const BWS = (process.env.BWS || '5e-4,1e-3,2e-3,4e-3,8e-3').split(',').map(Number);
const HORIZONS = (process.env.HORIZONS || '448,632,1600,3200').split(',').map(Number);
const NSTEP = +(process.env.NSTEP || 24000);

const modes = (arm, sv, K, E) => {
  const M = arm.massMatrix(0);
  const out = { bw: sv.bw, gb: [], bend: [] };
  for (const [i, j] of [[0, arm.j1], [1, arm.j2]]) {
    const Jr = j.N * j.N * j.Jm, Jred = 1 / (1 / j.Jl + 1 / Jr);
    out.gb.push({ w: Math.sqrt(j.K0 / Jred), zeta: j.C / (2 * Math.sqrt(j.K0 * Jred)), Jeff: M[i][i] + Jr });
  }
  // Euler-Bernoulli first cantilever mode of each link, from the section the rig builds.
  for (const L of [arm.L1, arm.L2]) {
    const h = 4, I = h ** 4 / 12, A = h * h, rho = 1;
    out.bend.push({ w: (1.875 ** 2) * Math.sqrt(E * I / (rho * A * L ** 4)) });
  }
  return out;
};

const per = (w) => (2 * Math.PI / w);

console.log('=== 1. THE MODE TABLE — the plant\'s own timescales against the loop that acts through them');
console.log('    (a machine has its structural modes WELL ABOVE its position loop; ChainServo\'s docstring: "keep the');
console.log('     bandwidth well below the slower gearbox resonance -- a position loop faster than the resonance it is');
console.log('     acting through does not control the tool, it excites it")\n');
console.log('  cell K/E        loop bw   gearbox 1        gearbox 2        link 1 bend      link 2 bend    SLOWEST MODE / bw');
for (const { K, E } of CELLS) {
  const m = await machine({ K, E });
  const md = modes(m.arm, m.servo, K, E);
  const all = [md.gb[0].w, md.gb[1].w, md.bend[0].w, md.bend[1].w];
  const slow = Math.min(...all);
  const f = (w) => `${w.toExponential(2)} (${per(w).toFixed(0)})`;
  console.log(`  ${String(K).padStart(5)}/${String(E).padEnd(6)} ${md.bw.toExponential(1)}   ${f(md.gb[0].w).padEnd(16)} ${f(md.gb[1].w).padEnd(16)} ${f(md.bend[0].w).padEnd(16)} ${f(md.bend[1].w).padEnd(15)} ${(slow / md.bw).toFixed(1)}x`);
  await m.l1.destroy(); await m.l2.destroy();
}
console.log('\n  w in rad/step, (period in steps). A real industrial arm runs its position loop 5-20x below its first');
console.log('  structural mode. The last column is that ratio for this machine at each cell.\n');

// ---- 2 and 3: the step response at a ladder of bandwidths, on the bench cell and one stiffer.
const stepCells = (process.env.STEPCELLS || '0.25/0.03,16/0.15').split(',').map((s) => {
  const [K, E] = s.split('/').map(Number); return { K, E };
});
for (const { K, E } of stepCells) {
  console.log(`=== 2/3. THE BANDWIDTH SWEEP AND THE HORIZON AUTHORITY — cell K ${K} / E ${E}`);
  console.log('  bw        cmd rise   tau rise   cmd pk@     settled(cmd)   fraction of the settled response delivered by step');
  console.log(`  ${' '.repeat(38)}${HORIZONS.map((h) => String(h).padStart(9)).join('')}`);
  for (const bw of BWS) {
    const m = await machine({ K, E });
    const { arm } = m;
    // ONE machine, a fresh servo per bandwidth: the gains are the only thing that moves.
    const sv = new ChainServo({ arm, bandwidth: bw, tauMax: m.servo.tauMax, speedMax: m.servo.speedMax });
    const [q1, q2] = arm.ik(8, -4, true);
    const truth = () => {
      const tool = arm.toolXY();
      const cx = arm.L1 * Math.cos(q1) + arm.L2 * Math.cos(q1 + q2), cy = arm.L1 * Math.sin(q1) + arm.L2 * Math.sin(q1 + q2);
      const J = arm.jacobian(q1, q2), det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
      const ex = tool[0] - cx, ey = tool[1] - cy;
      return [(J[1][1] * ex - J[0][1] * ey) / det, (-J[1][0] * ex + J[0][0] * ey) / det];
    };
    const refs = (d1) => [{ theta: q1 + d1, omega: 0, alpha: 0 }, { theta: q2, omega: 0, alpha: 0 }];
    const runStep = (cmdStep, tauStep) => {
      settle(arm, sv, q1, q2, 12000);
      const e0 = truth(); const rec = new Float64Array(NSTEP);
      for (let k = 0; k < NSTEP; k++) {
        const t = sv.torques(refs(cmdStep));
        arm.step(t[0] + tauStep, t[1], 1);
        rec[k] = truth()[0] - e0[0];
      }
      let fin = 0; for (let k = NSTEP - 2000; k < NSTEP; k++) fin += rec[k]; fin /= 2000;
      let pk = 0, kpk = 0; for (let k = 0; k < NSTEP; k++) if (Math.abs(rec[k]) > Math.abs(pk)) { pk = rec[k]; kpk = k; }
      const cross = (f) => { const tgt = f * fin; for (let k = 0; k < NSTEP; k++) if ((fin >= 0 && rec[k] >= tgt) || (fin < 0 && rec[k] <= tgt)) return k; return NSTEP; };
      return { rec, fin, pk, kpk, rise: cross(0.9) - cross(0.1) };
    };
    const a = runStep(0.01, 0);
    const b = runStep(0, 0.02 * sv.tauMax);
    const frac = HORIZONS.map((h) => (h < NSTEP ? a.rec[h] / a.fin : NaN));
    console.log(`  ${bw.toExponential(1)}  ${String(a.rise).padStart(8)}  ${String(b.rise).padStart(9)}  ${String(a.kpk).padStart(8)}  ${a.fin.toExponential(3).padStart(13)}   ${frac.map((v) => `${(100 * v).toFixed(1)}%`.padStart(9)).join('')}`);
    await m.l1.destroy(); await m.l2.destroy();
  }
  console.log('');
}
console.log('  The rise columns answer question 2: tracking 1/bw means the LOOP is the low-pass and §52.26.5 read it');
console.log('  backwards; a floor means the mechanics are. The right-hand block answers question 3: the pilot\'s horizon');
console.log('  on this arm is 56-79 samples at grid 8, i.e. 448-632 steps, and the QP inverts hGrid over exactly that.');
