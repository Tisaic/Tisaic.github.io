/**
 * @file The reduced twin built from the bench's own OBJECTS — `buildArm`'s joints, rigid chain,
 * servo and the conventional controller, with each lattice link replaced by resonant modes and an
 * optional tool payload in the rigid solve — as the experiments that measured it built it
 * (`test/plants/ilc-tables/experiments/twin/rtwin.mjs`, `mismatch.mjs`). It is separate code from
 * `lib/autoff/twin2r.js`, kept so a test can run both and require agreement (rule 61).
 */
import { buildArm, conventional, BENCH } from '../../lib/flexisim/bench.js';

export async function refTwin(rc, { K, payload = 0, stiff = 0, fit }) {
  const t = await buildArm(K, BENCH.E), a = t.arm;
  await t.l1.destroy(); await t.l2.destroy();
  const hold = Math.abs(a.gravityTorque([0, 0])[0]);
  if (stiff) for (const j of [a.j1, a.j2]) j.beta = stiff / (hold / a.j1.K0);
  let rigid = a.stepRigid;
  if (payload) {
    const mp = payload * (a.m1 + a.m2), G = BENCH.G, L1 = a.L1, L2 = a.L2;
    rigid = function (t1, t2, dt) {
      const M = this.massMatrix(), v = this.velocityTorque(), g = this.gravityTorque();
      const [q1, q2] = this.q, [w1, w2] = this.w, s1 = Math.sin(q1), c1 = Math.cos(q1), s12 = Math.sin(q1 + q2), c12 = Math.cos(q1 + q2);
      const Jt = [[-L1 * s1 - L2 * s12, -L2 * s12], [L1 * c1 + L2 * c12, L2 * c12]];
      const jd = [-(L1 * c1 * w1 * w1 + L2 * c12 * (w1 + w2) ** 2), -(L1 * s1 * w1 * w1 + L2 * s12 * (w1 + w2) ** 2)];
      const Mp = [[0, 0], [0, 0]]; for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) Mp[i][k] = M[i][k] + mp * (Jt[0][i] * Jt[0][k] + Jt[1][i] * Jt[1][k]);
      const vp = [0, 1].map((i) => v[i] + mp * (Jt[0][i] * jd[0] + Jt[1][i] * jd[1]));
      const gp = [0, 1].map((i) => g[i] + Jt[1][i] * (-mp * G));
      const b = [t1 + gp[0] - vp[0], t2 + gp[1] - vp[1]], det = Mp[0][0] * Mp[1][1] - Mp[0][1] * Mp[1][0];
      const a1 = (Mp[1][1] * b[0] - Mp[0][1] * b[1]) / det, a2 = (Mp[0][0] * b[1] - Mp[1][0] * b[0]) / det;
      this.alpha = [a1, a2]; this.w = [w1 + dt * a1, w2 + dt * a2]; this.q = [q1 + dt * this.w[0], q2 + dt * this.w[1]]; this._sync(); return this;
    };
  }
  const st = fit.map((f) => f.ms.map(() => new Float64Array(2 * f.nu))), out = new Float64Array(3);
  const inputs = (x) => { const f1 = x.frameParams(0), f2 = x.frameParams(1); return [[f1.gravity[1], f1.alpha[2]], [f2.gravity[1], f2.alpha[2], f2.originAccel[1]]]; };
  a.step = function (tc1, tc2, dt) {
    const t1 = this.j1.stepMotor(tc1, dt), t2 = this.j2.stepMotor(tc2, dt);
    rigid.call(this, t1, t2, dt);
    const u = inputs(this);
    fit.forEach((f, o) => { const uu = u[o === 2 ? 1 : 0]; let s = 0;
      f.ms.forEach(([w, z], mi) => { const S = st[o][mi]; for (let i = 0; i < f.nu; i++) { let y = S[2 * i], v = S[2 * i + 1]; v += uu[i] - 2 * z * w * v - w * w * y; y += v; S[2 * i] = y; S[2 * i + 1] = v; s += f.x[mi * f.nu + i] * y; } });
      out[o] = s; });
    return this;
  };
  a.toolXY = function () { const q1 = this.q[0], q2 = this.q[1], [w1, s1, w2] = out, c1 = Math.cos(q1), sn1 = Math.sin(q1);
    const ex = c1 * this.L1 - sn1 * w1, ey = sn1 * this.L1 + c1 * w1, a2 = q1 + s1 + q2, c2 = Math.cos(a2), sn2 = Math.sin(a2);
    return [ex + c2 * this.L2 - sn2 * w2, ey + sn2 * this.L2 + c2 * w2]; };
  const c = conventional(t, rc);
  return {
    m: t,
    reset(sp) { a.setPose(sp[0], sp[1]); c.reset(sp); for (const s of st) for (const x of s) x.fill(0); out.fill(0); },
    step(sp) { c.step(sp); },
    tool() { return a.toolXY(); },
  };
}
