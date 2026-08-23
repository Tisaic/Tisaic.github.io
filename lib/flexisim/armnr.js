// AN N-LINK PLANAR CHAIN, BY RECURSIVE NEWTON-EULER.
//
// `arm2r.js` writes the two-link mass matrix and Coriolis terms out by hand, which
// is fine for two and is exactly the kind of algebra that acquires a sign error at
// three. This does the same physics by the standard recursive algorithm instead --
// one O(N) pass gives the bias torques C(q,qdot)qdot + G(q), and N more give the
// columns of M(q) -- so nothing has to be differentiated by hand and adding a joint
// is a list entry rather than a derivation.
//
// THE TWO-LINK CASE IS THE TEST OF THE N-LINK CASE. The hand-derived 2R was
// verified against closed forms and conservation laws before this existed, so the
// general implementation is asserted to REPRODUCE IT TO MACHINE PRECISION at N = 2.
// Two independent routes to the same matrix is a far stronger statement than either
// alone, and it is what lets a third link be trusted without a third derivation.
//
// EVERY CONSTANT IS INTEGRATED FROM THE LATTICES, the same discipline as everywhere
// else here: the mass the rigid solve uses and the mass the elastic solver steps
// have to be the same mass.
//
// PLANAR, with joint i at the distal end of link i-1, all rotations about z, and
// the second and later body frames therefore both ROTATING and ACCELERATING -- the
// term that only exists in a chain and that frameParams() below supplies.

import { massProperties, armLength, tipDeflection, tipSlope, deflectionProfile } from './link.js';

/** Solve A x = b for small dense A by Gaussian elimination with partial pivoting. */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    if (p !== k) { const t = M[p]; M[p] = M[k]; M[k] = t; }
    const d = M[k][k];
    for (let j = k; j <= n; j++) M[k][j] /= d;
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const f = M[i][k];
      if (f === 0) continue;
      for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
    }
  }
  return M.map((row) => row[n]);
}

export class FlexArmNR {
  /**
   * @param {object} o
   * @param {Joint[]} o.joints
   * @param {Simulation[]} o.links   one lattice per link, in its own body frame
   * @param {number[]} [o.gravityWorld]
   * @param {number} [o.dt] if given, every joint's stability gate is checked here,
   *   after the lattice-derived inertias are installed.
   */
  constructor({ joints, links, gravityWorld = [0, 0, 0], dt = null }) {
    if (joints.length !== links.length) throw new Error('one joint per link');
    this.joints = joints.slice();
    this.links = links.slice();
    this.n = joints.length;
    this.gWorld = gravityWorld.slice();
    this.mp = links.map(massProperties);
    this.m = this.mp.map((p) => p.mass);
    this.c = this.mp.map((p) => p.centroid);
    this.Jp = this.mp.map((p) => p.inertiaAboutPivot);
    // The RNE wants the inertia about each link's own CENTROID; the lattice reports
    // it about the pivot, and the parallel-axis term is what separates them.
    this.Ic = this.Jp.map((J, i) => J - this.m[i] * this.c[i] * this.c[i]);
    this.L = links.map(armLength);

    this.q = new Array(this.n).fill(0);
    this.w = new Array(this.n).fill(0);
    this.alpha = new Array(this.n).fill(0);
    // The load-side inertia each joint reports is its own diagonal term at the
    // straight pose -- used only by the stability gate and reflectedInertia(). The
    // dynamics never read it, because the real inertia is M(q).
    const M0 = this.massMatrix(this.q);
    for (let i = 0; i < this.n; i++) this.joints[i].Jl = M0[i][i];
    if (dt != null) for (const j of this.joints) j.assertStable(dt);
    this._sync();
  }

  /**
   * One recursive Newton-Euler pass: the joint torques required to produce (q, w,
   * a), optionally including gravity.
   *
   * GRAVITY IS APPLIED BY ACCELERATING THE BASE AT -g, which is the standard trick
   * and is the same statement of equivalence brick 4 asserted bit-for-bit on the
   * lattice: a frame accelerating at -g is indistinguishable from gravity g.
   */
  _rne(q, w, a, gravity) {
    const n = this.n;
    let phi = 0, om = 0, al = 0;
    let ax = gravity ? -this.gWorld[0] : 0;
    let ay = gravity ? -this.gWorld[1] : 0;
    const ex = [], ey = [], acx = [], acy = [], omega = [], alp = [];
    for (let i = 0; i < n; i++) {
      phi += q[i]; om += w[i]; al += a[i];
      const c = Math.cos(phi), s = Math.sin(phi);
      ex.push(c); ey.push(s); omega.push(om); alp.push(al);
      acx.push(ax - this.c[i] * al * s - this.c[i] * om * om * c);
      acy.push(ay + this.c[i] * al * c - this.c[i] * om * om * s);
      ax += -this.L[i] * al * s - this.L[i] * om * om * c;
      ay += this.L[i] * al * c - this.L[i] * om * om * s;
    }
    let fx = 0, fy = 0, nz = 0;
    const tau = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      const Fx = this.m[i] * acx[i], Fy = this.m[i] * acy[i];
      // n_i = n_{i+1} + I_c alpha + (c_i e_i) x F_i + (L_i e_i) x f_{i+1}, and
      // f_{i+1} is the force accumulated from the links BEYOND i, so it has to be
      // used before F_i is folded in.
      nz += this.Ic[i] * alp[i]
        + (this.c[i] * ex[i]) * Fy - (this.c[i] * ey[i]) * Fx
        + (this.L[i] * ex[i]) * fy - (this.L[i] * ey[i]) * fx;
      fx += Fx; fy += Fy;
      tau[i] = nz;
    }
    return tau;
  }

  /** M(q), one RNE pass per column. Symmetric by construction of the algorithm. */
  massMatrix(q = this.q) {
    const n = this.n, z = new Array(n).fill(0);
    const cols = [];
    for (let j = 0; j < n; j++) {
      const a = new Array(n).fill(0);
      a[j] = 1;
      cols.push(this._rne(q, z, a, false));
    }
    const M = [];
    for (let i = 0; i < n; i++) M.push(cols.map((col) => col[i]));
    return M;
  }

  /** C(q,qdot)qdot + G(q): the torques needed to hold the motion against gravity. */
  bias(q = this.q, w = this.w) {
    return this._rne(q, w, new Array(this.n).fill(0), true);
  }

  /** Gravity torques APPLIED to the joints, in arm2r's sign convention. */
  gravityTorque(q = this.q) {
    const z = new Array(this.n).fill(0);
    return this._rne(q, z, z, true).map((t) => -t);
  }

  /** Velocity torques in arm2r's sign convention (C qdot, gravity excluded). */
  velocityTorque(q = this.q, w = this.w) {
    const z = new Array(this.n).fill(0);
    return this._rne(q, w, z, false);
  }

  /**
   * Frame kinematics for every link: the angular rate and acceleration, and the
   * LINEAR acceleration of its own origin -- computed with the base at rest, so
   * gravity is not folded in here and is supplied separately in body coordinates.
   */
  _kinematics() {
    const out = [];
    let phi = 0, om = 0, al = 0, ax = 0, ay = 0;
    for (let i = 0; i < this.n; i++) {
      phi += this.q[i]; om += this.w[i]; al += this.alpha[i];
      const c = Math.cos(phi), s = Math.sin(phi);
      out.push({ phi, omega: om, alpha: al, ax, ay });
      ax += -this.L[i] * al * s - this.L[i] * om * om * c;
      ay += this.L[i] * al * c - this.L[i] * om * om * s;
    }
    return out;
  }

  /** Operator parameters for link i: gravity, omega, alpha and the origin accel. */
  frameParams(i) {
    const k = this._kinematics()[i];
    const c = Math.cos(-k.phi), s = Math.sin(-k.phi);
    const gx = c * this.gWorld[0] - s * this.gWorld[1];
    const gy = s * this.gWorld[0] + c * this.gWorld[1];
    const ax = c * k.ax - s * k.ay;
    const ay = s * k.ax + c * k.ay;
    return { gravity: [gx, gy, 0], omega: [0, 0, k.omega], alpha: [0, 0, k.alpha],
      originAccel: [ax, ay, 0] };
  }

  setPose(q, w = null) {
    this.q = q.slice();
    this.w = w ? w.slice() : new Array(this.n).fill(0);
    for (let i = 0; i < this.n; i++) {
      this.joints[i].thM = this.q[i] * this.joints[i].N;
      this.joints[i].wM = this.w[i] * this.joints[i].N;
    }
    this._sync();
    return this;
  }

  _sync() {
    for (let i = 0; i < this.n; i++) {
      this.joints[i].thL = this.q[i];
      this.joints[i].wL = this.w[i];
    }
  }

  /** The RIGID core, given the torques the gearboxes are transmitting. */
  stepRigid(tau, dt) {
    const b = this.bias();
    const M = this.massMatrix();
    const rhs = tau.map((t, i) => t - b[i]);
    this.alpha = solve(M, rhs);
    for (let i = 0; i < this.n; i++) this.w[i] += dt * this.alpha[i];
    for (let i = 0; i < this.n; i++) this.q[i] += dt * this.w[i];
    this._sync();
    return this;
  }

  step(tauCmd, dt) {
    const tau = this.joints.map((j, i) => j.stepMotor(tauCmd[i], dt));
    this.stepRigid(tau, dt);
    for (let i = 0; i < this.n; i++) {
      this.links[i].operators[0].setParams(this.frameParams(i));
      this.links[i].advance(1);
    }
    return this;
  }

  /** Kinetic energy; with no gravity it is the whole energy. */
  energy() {
    const M = this.massMatrix();
    let T = 0;
    for (let i = 0; i < this.n; i++) for (let j = 0; j < this.n; j++) T += M[i][j] * this.w[i] * this.w[j];
    return 0.5 * T;
  }

  /**
   * The momentum conjugate to q1. With no gravity the base angle is a CYCLIC
   * coordinate -- the Lagrangian depends on the relative angles and not on where
   * the whole arm points -- so Noether says this is conserved for a free arm, and
   * it is exactly the Coriolis terms that make it so.
   */
  momentum1() {
    const M = this.massMatrix();
    let p = 0;
    for (let j = 0; j < this.n; j++) p += M[0][j] * this.w[j];
    return p;
  }

  /** Distance from the base to the tool, which folds with the chain. */
  toolRadius() {
    let phi = 0, x = 0, y = 0;
    for (let i = 0; i < this.n; i++) {
      phi += this.q[i];
      x += this.L[i] * Math.cos(phi); y += this.L[i] * Math.sin(phi);
    }
    return Math.hypot(x, y);
  }

  /**
   * Tool-tip error against where the ENCODERS say it is, TRANSVERSE TO THE LAST LINK.
   *
   * Every term is a first-order perturbation of the rigid tool position, so every term
   * has to be PROJECTED onto that one direction. An angular error dq at joint i moves
   * the tool by dq * (z x r_i) with r_i the joint-to-tool vector; a bending deflection w
   * at link i's tip moves it along that link's transverse y_i; and link i's tip SLOPE s
   * rotates everything downstream of it, i.e. it acts exactly like an angular error at
   * joint i+1. So with `lever(i) = (z x r_i) . y_last` and `cos(i) = y_i . y_last`:
   *
   *   tilt_i = -windup_i * lever(i)
   *   slope_i = s_i * lever(i + 1)          (absent for the last link)
   *   bend_i  = w_i * cos(i)
   *
   * THE ORIGINAL USED |r_i| WHERE IT NEEDED THE PROJECTION, added every bending term
   * unprojected, and omitted the slope terms while a comment said they were "reported
   * separately" -- they were reported nowhere. On the 2R version of exactly this
   * construction the omitted slope term alone measured 2.9x the sum of both wind-ups,
   * and the lever error changes SIGN at a folded pose, where |r| stays positive and its
   * projection does not.
   *
   * @returns {{tilt:number[], slope:number[], bend:number[], total:number}}
   */
  tipError() {
    const tilt = [], bend = [], slope = [];
    // Absolute link orientations, and the tool's position, walked once.
    const phi = [], cx = [], cy = [];
    let a = 0, x = 0, y = 0;
    for (let k = 0; k < this.n; k++) {
      a += this.q[k]; phi.push(a);
      cx.push(x); cy.push(y);                       // joint k's position
      x += this.L[k] * Math.cos(a); y += this.L[k] * Math.sin(a);
    }
    const last = phi[this.n - 1];
    // The transverse direction the whole error is measured in.
    const ux = -Math.sin(last), uy = Math.cos(last);
    // lever(i) = (z x (tool - joint_i)) . u, with z x v = (-v_y, v_x).
    const lever = (i) => (i >= this.n
      ? 0
      : -(y - cy[i]) * ux + (x - cx[i]) * uy);
    let total = 0;
    for (let i = 0; i < this.n; i++) {
      const t = -this.joints[i].windup() * lever(i);
      const b = tipDeflection(this.links[i]) * Math.cos(phi[i] - last);
      // A link's tip slope rotates everything downstream, so it is levered from the
      // NEXT joint. The last link has nothing downstream of it to rotate.
      const sl = i + 1 < this.n ? tipSlope(this.links[i]) * lever(i + 1) : 0;
      tilt.push(t); bend.push(b); slope.push(sl);
      total += t + b + sl;
    }
    return { tilt, slope, bend, total };
  }

  /** Distance from joint i to the tool at the current pose. */
  _reachFrom(i) {
    let phi = 0, x = 0, y = 0;
    for (let k = 0; k < this.n; k++) {
      phi += this.q[k];
      if (k < i) continue;
      x += this.L[k] * Math.cos(phi); y += this.L[k] * Math.sin(phi);
    }
    return Math.hypot(x, y);
  }

  encoders() { return this.joints.map((j) => j.encoder()); }
  profiles() { return this.links.map(deflectionProfile); }

  describe() {
    const M = this.massMatrix();
    return `${this.n}R: L=[${this.L.join(', ')}] m=[${this.m.join(', ')}] `
      + `M11=${M[0][0].toPrecision(5)} reach=${this.toolRadius().toFixed(2)}`;
  }
}
