// How much of the machine's error is STATIC, a function of pose alone? Hold the arm at a grid of
// poses, record the settled tool error (joint coords), then ask what share of each program's error
// that map explains (the error predicted from the map at the program's pose, against the real one).
import { buildArm, calibrateComp, ikOf, benchProgram, conventional, BENCH } from '../../../../../lib/flexisim/bench.js';
import { driveTo } from '../../../../../lib/flexisim/approach.js';
const m = await buildArm(); const ik = ikOf(m.arm.L1, m.arm.L2); const rc = await calibrateComp(m);
const G = 7, Q1 = [-1.3, -0.25], Q2 = [1.5, 2.6], SETTLE = +(process.env.SETTLE || 12000);
const map = new Float64Array(2 * G * G), c = conventional(m, rc);
for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
  const q = [Q1[0] + (Q1[1] - Q1[0]) * i / (G - 1), Q2[0] + (Q2[1] - Q2[0]) * j / (G - 1)];
  await driveTo(m.arm, m.servo, q, BENCH.feed); c.reset(q);
  let s0 = 0, s1 = 0, n = 0;
  for (let k = 0; k < SETTLE; k++) { c.step(q); if (k >= SETTLE - 3000) { const t = m.arm.toolXY(), y = ik(t[0], t[1]); s0 += y[0] - q[0]; s1 += y[1] - q[1]; n++; } }
  map[2 * (i * G + j)] = s0 / n; map[2 * (i * G + j) + 1] = s1 / n;
}
console.log('static error map (joint 1 / joint 2, rad), rows q1, cols q2:');
for (let i = 0; i < G; i++) console.log('  ' + Array.from({ length: G }, (_, j) => `${map[2 * (i * G + j)].toExponential(1)}/${map[2 * (i * G + j) + 1].toExponential(1)}`).join(' '));
const bil = (q, c2) => { const x = (q[0] - Q1[0]) / (Q1[1] - Q1[0]) * (G - 1), yv = (q[1] - Q2[0]) / (Q2[1] - Q2[0]) * (G - 1);
  const i = Math.max(0, Math.min(G - 2, Math.floor(x))), j = Math.max(0, Math.min(G - 2, Math.floor(yv))), fx = Math.max(0, Math.min(1, x - i)), fy = Math.max(0, Math.min(1, yv - j));
  const v = (a, b) => map[2 * (a * G + b) + c2]; return (1 - fx) * (1 - fy) * v(i, j) + fx * (1 - fy) * v(i + 1, j) + (1 - fx) * fy * v(i, j + 1) + fx * fy * v(i + 1, j + 1); };
for (const [sh, f] of [['sharp', 3e-3], ['circle', 3e-3], ['rounded', 2e-3], ['sharp', 1e-3]]) {
  const prog = benchProgram(sh, f, ik), L = prog.lap; await driveTo(m.arm, m.servo, prog.at(0), BENCH.feed);
  const cc = conventional(m, rc); cc.reset(prog.at(0)); let se = [0, 0], sr = [0, 0];
  for (let lap = 0; lap < 2; lap++) for (let k = 0; k < L; k++) { const r = prog.at(k); cc.step(r); if (lap) { const t = m.arm.toolXY(), y = ik(t[0], t[1]);
    for (let c2 = 0; c2 < 2; c2++) { const e = y[c2] - r[c2], p = bil(r, c2); se[c2] += e * e; sr[c2] += (e - p) ** 2; } } }
  console.log(`${sh} ${f}: share of each joint's error energy the STATIC map explains: ${se.map((x, c2) => (100 * (1 - sr[c2] / x)).toFixed(0) + '%').join(' / ')}  (rms ${se.map((x) => Math.sqrt(x / L).toExponential(2)).join('/')} -> ${sr.map((x) => Math.sqrt(x / L).toExponential(2)).join('/')})`);
}
