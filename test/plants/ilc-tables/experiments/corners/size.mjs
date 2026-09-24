// Largest tool acceleration whose PLANNED motion stays inside a fraction of the drive's
// torque-speed envelope on every program, with exact stops and a jerk smoothing time.
import { buildArm, ikOf, jointProgram, BENCH } from '../../../../../lib/flexisim/bench.js';
import { sharpRect, roundedRect, circle } from '../../../../../lib/flexisim/toolpath.js';
const m = await buildArm(); const ik = ikOf(m.arm.L1, m.arm.L2); const S = m.servo, A = m.arm;
const J = [A.j1, A.j2];
const shapes = (o) => [['sharp', sharpRect({ ...o, w: 8, h: 8 })], ['rounded', roundedRect({ ...o, w: 8, h: 8, r: 1.5, closed: true })], ['circle', circle({ ...o, r: 4 })]];
function demand(path) {
  const prog = jointProgram(path, ik, { smooth: JERKNOW }), L = prog.lap; let worst = 0;
  for (let k = 0; k < L; k++) {
    const a = prog.at(k - 1), b = prog.at(k), c = prog.at(k + 1);
    const refs = [0, 1].map((i) => ({ theta: b[i], omega: (c[i] - a[i]) / 2, alpha: c[i] - 2 * b[i] + a[i] }));
    const tj = S.jointTorques(refs);
    for (let i = 0; i < 2; i++) {
      const want = tj[i] / J[i].N + J[i].N * J[i].Jm * refs[i].alpha, ms = refs[i].omega * J[i].N;
      const along = Math.sign(want) * ms;
      const cap = S.tauMax * Math.max(0, 1 - (S.speedMax > 0 ? Math.max(0, along) / S.speedMax : 0));
      worst = Math.max(worst, Math.abs(want) / Math.max(cap, 1e-300));
    }
  }
  return { worst, lap: prog.lap };
}
const FEEDS = [5e-4, 1e-3, 1.5e-3, 2e-3, 3e-3];
const BUDGET = +(process.env.BUDGET || 0.6);
console.log(`drive: tauMax ${S.tauMax.toExponential(3)}, no-load speed ${S.speedMax}, G ${BENCH.G}`);
let JERKNOW = 0;
for (const jerkDt of (process.env.JERKS || '0,250,750,1500').split(',').map(Number)) {
  JERKNOW = jerkDt;
  // bisection on log(accel) for the worst program at the budget
  const worstAt = (acc) => { let w = 0; for (const feed of FEEDS) for (const [, p] of shapes({ feed, accel: acc, cornerStop: true, dwell: jerkDt, centre: BENCH.centre })) w = Math.max(w, demand(p).worst); return w; };
  let lo = 1e-7, hi = 1e-4;
  for (let it = 0; it < 14; it++) { const mid = Math.sqrt(lo * hi); if (worstAt(mid) <= BUDGET) lo = mid; else hi = mid; }
  const laps = shapes({ feed: 3e-3, accel: lo, cornerStop: true, dwell: jerkDt, centre: BENCH.centre }).map(([n, p]) => `${n} ${Math.ceil(p.lap)}`);
  const laps2 = shapes({ feed: 2e-3, accel: lo, cornerStop: true, dwell: jerkDt, centre: BENCH.centre }).map(([n, p]) => `${n} ${Math.ceil(p.lap)}`);
  console.log(`jerkDt ${jerkDt}: accel ${lo.toExponential(3)} (${(lo / BENCH.G).toFixed(2)} g; the old planner used ${(BENCH.ACCEL / BENCH.G).toFixed(0)} g) · laps at 3e-3: ${laps.join(', ')} · at 2e-3: ${laps2.join(', ')}`);
}
