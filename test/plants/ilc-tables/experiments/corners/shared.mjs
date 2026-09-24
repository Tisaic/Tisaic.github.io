// ONE corner correction, learned from the error AVERAGED over all corners, applied identically at
// every corner in its own frame (tool space, mapped to joints by the inverse Jacobian).
import { buildArm, calibrateComp, ikOf, jointProgram, benchProgram, conventional, BENCH } from '../../../../../lib/flexisim/bench.js';
import { driveTo } from '../../../../../lib/flexisim/approach.js';
import { decompose, cornerSignatures } from '../../../../../lib/flexisim/contour.js';
import { sharpRect } from '../../../../../lib/flexisim/toolpath.js';
const m = await buildArm(); const ik = ikOf(m.arm.L1, m.arm.L2), L1 = m.arm.L1, L2 = m.arm.L2;
const WHICH = process.env.WHICH || 'new', IT = +(process.env.IT || 25), FEED = +(process.env.FEED || 3e-3);
const prog = WHICH === 'old' ? jointProgram(sharpRect({ w: 8, h: 8, centre: BENCH.centre, feed: FEED, accel: 4e-5, cornerDt: 40 }), ik) : benchProgram('sharp', FEED, ik);
const L = prog.lap;
const probe = cornerSignatures(prog, new Float64Array(2 * L).map((_, i) => (i % 2 ? prog.cmd(i >> 1).y : prog.cmd(i >> 1).x)));
const K = probe.k, D = probe.dir, NC = K.length;
// each scan: its nearest corner and offset
const owner = new Int32Array(L), off = new Int32Array(L); let H = 0;
for (let k = 0; k < L; k++) { let b = 0, bd = Infinity; for (let i = 0; i < NC; i++) { let d = k - K[i]; d = ((d % L) + L) % L; if (d > L / 2) d -= L; if (Math.abs(d) < Math.abs(bd)) { bd = d; b = i; } } owner[k] = b; off[k] = bd; H = Math.max(H, Math.abs(bd)); }
const NW = 2 * H + 1;
const Jinv = (q) => { const s1 = Math.sin(q[0]), c1 = Math.cos(q[0]), s12 = Math.sin(q[0] + q[1]), c12 = Math.cos(q[0] + q[1]);
  const a = -L1 * s1 - L2 * s12, b = -L2 * s12, c = L1 * c1 + L2 * c12, d = L2 * c12, det = a * d - b * c; return [d / det, -b / det, -c / det, a / det]; };
const rc = await calibrateComp(m); await driveTo(m.arm, m.servo, prog.at(0), BENCH.feed);
const ctl = conventional(m, rc); ctl.reset(prog.at(0));
const tool = new Float64Array(2 * L);
function trimOf(C) { const U = new Float64Array(2 * L); for (let k = 0; k < L; k++) { const i = owner[k], j = off[k] + H, d = D[i], n = [-d[1], d[0]];
  const wx = C[2 * j] * d[0] + C[2 * j + 1] * n[0], wy = C[2 * j] * d[1] + C[2 * j + 1] * n[1]; const J = Jinv(prog.at(k)); U[2 * k] = J[0] * wx + J[1] * wy; U[2 * k + 1] = J[2] * wx + J[3] * wy; } return U; }
function lap(U) { m.servo.resetLimitStats(); let ss = 0; const ec = new Float64Array(2 * NW), cnt = new Float64Array(NW);
  for (let k = 0; k < L; k++) { const r = prog.at(k); ctl.step([r[0] + U[2 * k], r[1] + U[2 * k + 1]]); const t = m.arm.toolXY(); tool[2 * k] = t[0]; tool[2 * k + 1] = t[1];
    const cm = prog.cmd(k), d0 = decompose(prog.path, t, cm); ss += d0.contour ** 2 + d0.lag ** 2;
    const i = owner[k], j = off[k] + H, d = D[i], ex = t[0] - cm.x, ey = t[1] - cm.y; ec[2 * j] += d[0] * ex + d[1] * ey; ec[2 * j + 1] += -d[1] * ex + d[0] * ey; cnt[j]++; }
  for (let j = 0; j < NW; j++) { ec[2 * j] /= Math.max(1, cnt[j]); ec[2 * j + 1] /= Math.max(1, cnt[j]); }
  return { rms: Math.sqrt(ss / L), ec, sat: Math.max(...m.servo.limitStats().map((x) => x.fraction)) }; }
const run = (C) => { const U = trimOf(C); lap(U); return lap(U); };
const report = (label, r) => { const cs = cornerSignatures(prog, tool, { smooth: BENCH.JERK }); console.log(`${WHICH} sharp ${FEED}: ${label.padEnd(26)} tool rms ${r.rms.toExponential(3)} · corners ${(100 * cs.spread).toFixed(1)}% not common, rough ${(100 * cs.rough).toFixed(1)}%, peak ${cs.peak.toExponential(2)} · saturated ${(100 * r.sat).toFixed(2)}%`); };
let C = new Float64Array(2 * NW); let r = run(C); report('machine', r);
const Q = (x, W) => { let y = x.slice(); for (let p = 0; p < 2; p++) { const z = new Float64Array(y.length); for (let a = 0; a < 2; a++) for (let j = 0; j < NW; j++) { let s = 0, n = 0; for (let t = Math.max(0, j - W); t <= Math.min(NW - 1, j + W); t++) { s += y[2 * t + a]; n++; } z[2 * j + a] = s / n; } y = z; } return y; };
const CANDS = [[Math.round(L / 128), Math.round(L / 100)], [Math.round(L / 64), Math.round(L / 100)], [Math.round(L / 256), Math.round(L / 200)], [Math.round(L / 128), Math.round(L / 200)]];
let ci = 0, beta = 0.5, rej = 0, best = r;
for (let it = 0; it < IT; it++) {
  const [tau, W] = CANDS[ci], d = new Float64Array(2 * NW);
  for (let j = 0; j < NW; j++) for (let a = 0; a < 2; a++) d[2 * j + a] = C[2 * j + a] - beta * best.ec[2 * Math.min(NW - 1, j + tau) + a];
  const Cn = Q(d, W), rn = run(Cn);
  if (rn.rms < best.rms * 0.999) { C = Cn; best = rn; rej = 0; } else { beta *= 0.5; if (++rej >= 3) { ci = (ci + 1) % CANDS.length; rej = 0; beta = Math.min(0.5, beta * 4); } }
}
run(C); report('shared corner, learned', best);
