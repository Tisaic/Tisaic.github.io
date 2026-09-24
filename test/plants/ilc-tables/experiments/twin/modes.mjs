// The arm's modes, separated: after a small setpoint step on one joint, the ringing of the link
// BENDING (tool vs the rigid arm) and of the gearbox WIND-UP, each joint, three poses.
import { buildArm, calibrateComp, ikOf, conventional, BENCH } from '../../../../../lib/flexisim/bench.js';
import { driveTo } from '../../../../../lib/flexisim/approach.js';
const m = await buildArm(), ik = ikOf(m.arm.L1, m.arm.L2), rc = await calibrateComp(m);
const per = (x) => { const n = x.length, W = 400, d = x.map((v, i) => { let s = 0, c = 0; for (let t = Math.max(0, i - W); t <= Math.min(n - 1, i + W); t++) { s += x[t]; c++; } return v - s / c; });
  const z = []; for (let i = 1; i < n - W; i++) if (d[i - 1] < 0 && d[i] >= 0) z.push(i); if (z.length < 3) return { per: NaN, decay: NaN };
  const T = (z[z.length - 1] - z[0]) / (z.length - 1); const pk = (a, b) => Math.max(...d.slice(a, b).map(Math.abs));
  const p1 = pk(z[0], z[1]), p2 = pk(z[z.length - 2], z[z.length - 1]); return { per: T, zeta: Math.log(p1 / p2) / (2 * Math.PI * (z.length - 2)) }; };
for (const pose of [[-0.8, 2.0], [-0.4, 1.6], [-1.1, 2.4]]) for (const j of [0, 1]) {
  await driveTo(m.arm, m.servo, pose, BENCH.feed); const c = conventional(m, rc); c.reset(pose);
  for (let k = 0; k < 20000; k++) c.step(pose);
  const sp = [pose[0], pose[1]]; sp[j] += 2e-3; const bend = [[], []], wind = [[], []];
  for (let k = 0; k < 24000; k++) { c.step(sp); const t = m.arm.toolXY(), tr = m.arm.toolXY(true), y = ik(t[0], t[1]), yr = ik(tr[0], tr[1]);
    for (let q = 0; q < 2; q++) { bend[q].push(y[q] - yr[q]); wind[q].push(q === 0 ? m.arm.j1.windup() : m.arm.j2.windup()); } }
  const f = (o) => `${Number.isFinite(o.per) ? o.per.toFixed(0) : '—'} scans (ζ ${Number.isFinite(o.zeta) ? o.zeta.toFixed(3) : '—'})`;
  console.log(`pose ${pose} step joint ${j + 1}: bending j1 ${f(per(bend[0]))} j2 ${f(per(bend[1]))} · wind-up j1 ${f(per(wind[0]))} j2 ${f(per(wind[1]))}`);
}
