// MACHINES THE TWIN DOES NOT MODEL. The twin is always built nominal; the machine differs in its
// PHYSICS only (its drive and conventional controller keep their nominal model, as a real drive's
// configured payload and inertias would):
//   payload    a point mass at the tool, 20% of the two links' mass, in the rigid solve only
//   backlash3  three times the gearbox backlash
//   friction   Stribeck friction on both motors (breakaway 8%, Coulomb 5% of the hold torque)
//   stiff      a progressive gearbox: K rises 50% at joint 1's gravity-hold wind-up
import { buildArm, BENCH } from '../../../../../lib/flexisim/bench.js';
// the physics a twin can also carry: payload as a fraction of the links' mass, stiffening as the
// fractional rise of K at joint 1's gravity-hold wind-up
export function physics(a, { payload = 0, stiff = 0, friction = false } = {}) {
  const hold = Math.abs(a.gravityTorque([0, 0])[0]) / BENCH.RATIO;
  if (friction) for (const j of [a.j1, a.j2]) j.friction = { tauS: 0.08 * hold, tauC: 0.05 * hold, vs: 5e-3, viscous: 0, eps: 1e-4 };
  if (stiff) { const wu = Math.abs(a.gravityTorque([0, 0])[0]) / a.j1.K0; for (const j of [a.j1, a.j2]) j.beta = stiff / wu; }
  if (payload) {
    const mp = payload * (a.m1 + a.m2), G = BENCH.G, L1 = a.L1, L2 = a.L2;
    a.stepRigid = function (t1, t2, dt) {
      const M = this.massMatrix(), v = this.velocityTorque(), g = this.gravityTorque();
      const [q1, q2] = this.q, [w1, w2] = this.w, s1 = Math.sin(q1), c1 = Math.cos(q1), s12 = Math.sin(q1 + q2), c12 = Math.cos(q1 + q2);
      const Jt = [[-L1 * s1 - L2 * s12, -L2 * s12], [L1 * c1 + L2 * c12, L2 * c12]];     // d(tool)/dq, rows x, y
      const jd = [-(L1 * c1 * w1 * w1 + L2 * c12 * (w1 + w2) ** 2), -(L1 * s1 * w1 * w1 + L2 * s12 * (w1 + w2) ** 2)];  // Jdot qdot
      const Mp = [[0, 0], [0, 0]]; for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) Mp[i][k] = M[i][k] + mp * (Jt[0][i] * Jt[0][k] + Jt[1][i] * Jt[1][k]);
      const vp = [0, 1].map((i) => v[i] + mp * (Jt[0][i] * jd[0] + Jt[1][i] * jd[1]));
      const gp = [0, 1].map((i) => g[i] + Jt[1][i] * (-mp * G));
      const b = [t1 + gp[0] - vp[0], t2 + gp[1] - vp[1]], det = Mp[0][0] * Mp[1][1] - Mp[0][1] * Mp[1][0];
      const a1 = (Mp[1][1] * b[0] - Mp[0][1] * b[1]) / det, a2 = (Mp[0][0] * b[1] - Mp[1][0] * b[0]) / det;
      this.alpha = [a1, a2]; this.w = [w1 + dt * a1, w2 + dt * a2]; this.q = [q1 + dt * this.w[0], q2 + dt * this.w[1]]; this._sync(); return this;
    };
  }
  return a;
}
const KINDS = { payload: { payload: 0.2 }, friction: { friction: true }, stiff: { stiff: 0.5 },
  all: { payload: 0.2, friction: true, stiff: 0.5 }, off: { payload: 0.13, friction: true, stiff: 0.35 } };
export async function machineArm(kind = '') {
  const saved = BENCH.BACKLASH; if (kind === 'backlash3' || kind === 'all' || kind === 'off') BENCH.BACKLASH = 3 * saved;
  const m = await buildArm(); BENCH.BACKLASH = saved;
  physics(m.arm, KINDS[kind] || {});
  return m;
}
