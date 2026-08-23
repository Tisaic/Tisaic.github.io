// A TWO-LINK PLANAR ARM: two lumped joints, two lattice links, one coupled solve.
//
// THIS IS THE FIRST THING ON THE TAB THAT IS ACTUALLY A CHAIN, and a chain is not
// two single-joint arms next to each other. Three things appear here that a single
// joint cannot show, and every one of them is a term a per-joint model has no way
// to represent:
//
//   THE INERTIA IS CONFIGURATION DEPENDENT.  M11 carries 2 m2 l1 c2 cos(q2), so
//        the inertia joint 1 has to accelerate changes by a factor of a few as the
//        elbow folds. A controller tuned at one pose is mistuned at another.
//   THE JOINTS ARE COUPLED THROUGH M.  Accelerating joint 1 puts M21*alpha1 on
//        joint 2 whether or not joint 2 was asked to do anything, which winds its
//        gearbox up and moves the tool. That is the term the tab's premise is
//        about: a fast joint-1 move loads joint 2, and the encoder on joint 2 sees
//        none of it.
//   THE SECOND LINK'S FRAME IS NOT JUST ROTATING, IT IS ACCELERATING.  Its origin
//        is the elbow, which is being swung around by joint 1, so the body frame
//        carries the elbow's LINEAR acceleration as well as the frame's angular
//        terms. Omitting it leaves a plausible wrong answer rather than an error:
//        the link still bends, just by the wrong amount, and only a closed form
//        says which.
//
// THE RIGID DYNAMICS ARE THE STANDARD PLANAR 2R, with every constant INTEGRATED
// FROM THE LATTICES rather than stated -- the same discipline the single-joint arm
// uses, and for the same reason: the mass the rigid solve uses and the mass the
// elastic solver steps have to be the same mass, and nothing else would notice if
// they drifted apart.
//
// THE LOAD SIDE CANNOT BE INTEGRATED INSIDE EACH JOINT any more, because M couples
// them; Joint.stepMotor() exists for exactly that split. The motor half is genuinely
// per-joint (it sits upstream of the gear teeth and sees only the reaction tau/N).

import { massProperties, armLength, tipDeflection, tipSlope, deflectionProfile }
  from './link.js';

/** Rotate a planar vector by `th`. */
const rot = (x, y, th) => {
  const c = Math.cos(th), s = Math.sin(th);
  return [c * x - s * y, s * x + c * y];
};

export class FlexArm2R {
  /**
   * @param {object} o
   * @param {Joint} o.joint1, @param {Simulation} o.link1
   * @param {Joint} o.joint2, @param {Simulation} o.link2
   * @param {number[]} [o.gravityWorld]
   * @param {number} [o.dt]  if given, both joints' stability gates are checked
   *   here, after the lattice-derived inertias are installed -- the caller cannot
   *   know them until this point.
   */
  constructor({ joint1, link1, joint2, link2, gravityWorld = [0, 0, 0], dt = null }) {
    this.j1 = joint1; this.j2 = joint2;
    this.l1 = link1; this.l2 = link2;
    this.gWorld = gravityWorld.slice();

    const mp1 = massProperties(link1), mp2 = massProperties(link2);
    this.mp1 = mp1; this.mp2 = mp2;
    this.L1 = armLength(link1);            // pivot 1 to the elbow
    this.L2 = armLength(link2);            // elbow to the tool
    this.m1 = mp1.mass; this.c1 = mp1.centroid; this.J1 = mp1.inertiaAboutPivot;
    this.m2 = mp2.mass; this.c2 = mp2.centroid; this.J2 = mp2.inertiaAboutPivot;

    // THE LOAD-SIDE INERTIA EACH JOINT REPORTS IS ITS OWN DIAGONAL TERM AT THE
    // STRAIGHT POSE. It is used only by the stability gate and by reflectedInertia();
    // the dynamics below never read it, because the real inertia is M(q) and is not
    // a per-joint number at all. Setting it to something defensible rather than
    // leaving the caller's guess is what keeps the gate meaningful.
    this.j1.Jl = this.J1 + this.J2 + this.m2 * this.L1 * (this.L1 + 2 * this.c2);
    this.j2.Jl = this.J2;
    if (dt != null) { this.j1.assertStable(dt); this.j2.assertStable(dt); }

    this.q = [0, 0];        // joint 1 absolute, joint 2 RELATIVE to link 1
    this.w = [0, 0];
    this.alpha = [0, 0];
    this._sync();
  }

  /** Set the load-side pose and rate directly (initialisation, and tests). */
  setPose(q1, q2, w1 = 0, w2 = 0) {
    this.q = [q1, q2]; this.w = [w1, w2];
    // The motors follow, so the gearboxes start unwound rather than pre-loaded --
    // otherwise every run begins with a torque nobody commanded.
    this.j1.thM = q1 * this.j1.N; this.j2.thM = q2 * this.j2.N;
    this.j1.wM = w1 * this.j1.N; this.j2.wM = w2 * this.j2.N;
    this._sync();
    return this;
  }

  _sync() {
    this.j1.thL = this.q[0]; this.j1.wL = this.w[0];
    this.j2.thL = this.q[1]; this.j2.wL = this.w[1];
  }

  /**
   * The 2x2 mass matrix at the current elbow angle. Symmetric by construction, as
   * it must be -- an asymmetric M is not a kinetic-energy quadratic form and would
   * quietly break energy conservation.
   */
  massMatrix(q2 = this.q[1]) {
    const cs = Math.cos(q2);
    const m12 = this.J2 + this.m2 * this.L1 * this.c2 * cs;
    return [
      [this.J1 + this.J2 + this.m2 * this.L1 * (this.L1 + 2 * this.c2 * cs), m12],
      [m12, this.J2],
    ];
  }

  /** Centrifugal + Coriolis torques, C(q,qdot)*qdot. */
  velocityTorque(q = this.q, w = this.w) {
    const h = -this.m2 * this.L1 * this.c2 * Math.sin(q[1]);
    return [h * w[1] * w[1] + 2 * h * w[0] * w[1], -h * w[0] * w[0]];
  }

  /**
   * Gravity torques on the two joints, from the SAME material distributions the
   * elastic solver is stepping.
   *
   * WRITTEN AS A CROSS PRODUCT rather than as m g x cos(q), so a non-planar or
   * rotated gravity still gives the right answer and a sign cannot hide in a
   * trigonometric identity that happens to hold at q = 0.
   */
  gravityTorque(q = this.q) {
    const [gx, gy] = this.gWorld;
    const [c1x, c1y] = rot(this.c1, 0, q[0]);
    const [ex, ey] = rot(this.L1, 0, q[0]);                 // the elbow
    const [d2x, d2y] = rot(this.c2, 0, q[0] + q[1]);        // elbow -> link 2 centroid
    const t1 = (c1x * this.m1 * gy - c1y * this.m1 * gx)
      + ((ex + d2x) * this.m2 * gy - (ey + d2y) * this.m2 * gx);
    const t2 = d2x * this.m2 * gy - d2y * this.m2 * gx;
    return [t1, t2];
  }

  /**
   * The frame parameters for link `i` (0 or 1) at the current state: gravity in
   * BODY coordinates, the frame's angular velocity and acceleration, and -- for
   * link 2 -- the LINEAR acceleration of its origin, the elbow.
   *
   * THE ELBOW'S ACCELERATION IS THE TERM THAT ONLY EXISTS IN A CHAIN, and it has
   * two parts with different signatures: a tangential l1*alpha1 perpendicular to
   * link 1 and a centripetal l1*omega1^2 pointing back along it. A test that only
   * ever accelerates from rest sees the first and not the second; one that only
   * spins at constant rate sees the second and not the first.
   */
  frameParams(i) {
    const [q1, q2] = this.q, [w1, w2] = this.w, [a1, a2] = this.alpha;
    if (i === 0) {
      const [gx, gy] = rot(this.gWorld[0], this.gWorld[1], -q1);
      return { gravity: [gx, gy, 0], omega: [0, 0, w1], alpha: [0, 0, a1],
        originAccel: [0, 0, 0] };
    }
    const phi = q1 + q2;
    const [gx, gy] = rot(this.gWorld[0], this.gWorld[1], -phi);
    // Elbow acceleration in WORLD axes, then rotated into link 2's body frame.
    const [tx, ty] = rot(0, this.L1 * a1, q1);          // tangential
    const [nx, ny] = rot(-this.L1 * w1 * w1, 0, q1);    // centripetal
    const [ax, ay] = rot(tx + nx, ty + ny, -phi);
    return { gravity: [gx, gy, 0], omega: [0, 0, w1 + w2], alpha: [0, 0, a1 + a2],
      originAccel: [ax, ay, 0] };
  }

  get frameOp1() { return this.l1.operators[0]; }
  get frameOp2() { return this.l2.operators[0]; }

  /**
   * One step. Motors first (each sees only tau/N), then the COUPLED load solve,
   * then the frames, then the lattices.
   */
  /**
   * The RIGID core: given the torques the two gearboxes are transmitting, solve
   * M qddot = tau + G - C qdot and integrate. No motors, no lattices.
   *
   * SEPARATED SO IT CAN BE VERIFIED ALONE, which is the same argument that made
   * the lumped joint its own brick. With no gravity and no joint torques the 2R is
   * a closed conservative system whose energy AND whose momentum conjugate to q1
   * are constants of the motion -- neither of which is anything the solve computes,
   * so both are real checks rather than restatements. Running them through the
   * full step() would cost a lattice advance per step and measure the elastic
   * damping instead.
   */
  stepRigid(t1, t2, dt) {
    const M = this.massMatrix();
    const v = this.velocityTorque();
    const g = this.gravityTorque();
    const b = [t1 + g[0] - v[0], t2 + g[1] - v[1]];
    const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    const a1 = (M[1][1] * b[0] - M[0][1] * b[1]) / det;
    const a2 = (M[0][0] * b[1] - M[1][0] * b[0]) / det;
    this.alpha = [a1, a2];
    this.w = [this.w[0] + dt * a1, this.w[1] + dt * a2];
    this.q = [this.q[0] + dt * this.w[0], this.q[1] + dt * this.w[1]];
    this._sync();
    return this;
  }

  /** Kinetic energy, and with no gravity it is the whole energy. */
  energy() {
    const M = this.massMatrix(), [w1, w2] = this.w;
    return 0.5 * (M[0][0] * w1 * w1 + 2 * M[0][1] * w1 * w2 + M[1][1] * w2 * w2);
  }

  /**
   * The generalised momentum conjugate to q1, dT/dq1dot.
   *
   * WITH NO GRAVITY q1 IS A CYCLIC COORDINATE -- the Lagrangian does not depend on
   * it, only on q2 -- so Noether says this is conserved for a free arm. It is the
   * sharpest available check on the Coriolis terms, because it is EXACTLY those
   * terms that make it conserved: drop them and it drifts immediately.
   */
  momentum1() {
    const M = this.massMatrix();
    return M[0][0] * this.w[0] + M[0][1] * this.w[1];
  }

  step(tauCmd1, tauCmd2, dt) {
    // The transmitted torques are read BEFORE anything moves, which is what makes
    // the two motor updates and the load solve see one consistent state.
    const t1 = this.j1.stepMotor(tauCmd1, dt);
    const t2 = this.j2.stepMotor(tauCmd2, dt);
    this.stepRigid(t1, t2, dt);

    this.frameOp1.setParams(this.frameParams(0));
    this.frameOp2.setParams(this.frameParams(1));
    this.l1.advance(1);
    this.l2.advance(1);
    return this;
  }

  /**
   * Tool-tip position error TRANSVERSE TO LINK 2, against where the ENCODERS say the tip
   * is -- the controller's own picture, which is wrong by both wind-ups and both links'
   * bending. Every term is a first-order perturbation of the rigid tool position, so each
   * has to be PROJECTED onto that one direction; three of the four were not.
   *
   *   dP = -wu1 (z x r_tool) + (s1 - wu2)(z x r_2) + w1 y1 + w2 y2
   *
   * with r_tool the shoulder-to-tool vector, r_2 the elbow-to-tool vector, y1/y2 the
   * transverse directions of the two links, w the tip deflections and s1 link 1's TIP
   * SLOPE. Projecting onto y2, and using z x r_tool . y2 = L1 cos q2 + L2 and
   * y1 . y2 = cos q2:
   *
   *   tilt1 = -wu1 (L1 cos q2 + L2)     slope1 = +s1 L2
   *   tilt2 = -wu2 L2                   bend1 = w1 cos q2      bend2 = w2
   *
   * THREE CORRECTIONS, AND THE MISSING TERM WAS THE BIGGEST. (i) `tilt1` used
   * `toolRadius()`, the MAGNITUDE of the shoulder-to-tool vector, which is not its
   * projection -- and the two differ by more than a third at a folded elbow and have
   * OPPOSITE SIGNS at the top of the pose ladder, where L1 cos q2 + L2 = -4.0 against a
   * radius of +4.0. (ii) `bend1` was added unprojected though it is transverse to link
   * ONE. (iii) The slope term was absent entirely, while a comment claimed it was
   * "reported separately" -- it was reported nowhere. Measured on the shipped chain at a
   * settled pose: the old total was -7.18e-2 and the correct one is -1.03e-1, a factor of
   * 1.44, of which the omitted slope term alone is 2.9x the sum of BOTH wind-ups.
   *
   * IT WAS NOT ONLY A REPORTING ERROR. This is the training target of `ChainSensor` and
   * the basis of `toolTrackingError()`, so the chain tab's tool sensor was estimating a
   * quantity that is not the tool's error, and its closed loop was driving it.
   *
   * AND THE AXIAL COMPONENT IS REPORTED RATHER THAN DROPPED. A bent elbow means part of
   * the deviation lies ALONG link 2, where no "transverse to link 2" scalar can carry it:
   * (-wu1 L1 + w1) sin q2, measured at 30% of the transverse magnitude on this chain. It
   * is intrinsic to the geometry and independent of the following error.
   */
  tipError() {
    const c2 = Math.cos(this.q[1]), s2 = Math.sin(this.q[1]);
    const wu1 = this.j1.windup(), wu2 = this.j2.windup();
    const w1 = tipDeflection(this.l1), w2 = tipDeflection(this.l2);
    const s1 = tipSlope(this.l1);
    const [lev1, lev2] = this.toolLever();
    const tilt1 = -wu1 * lev1;
    const tilt2 = -wu2 * lev2;
    const slope1 = s1 * this.L2;
    const bend1 = w1 * c2;
    const bend2 = w2;
    return { tilt1, tilt2, slope1, bend1, bend2,
      total: tilt1 + tilt2 + slope1 + bend1 + bend2,
      axial: (-wu1 * this.L1 + w1) * s2 };
  }

  /**
   * HOW FAR THE TOOL MOVES, TRANSVERSE TO LINK 2, PER RADIAN AT EACH JOINT.
   *
   *   d(tool)/dq1 = z x r_tool,  projected onto y2 = L1 cos q2 + L2
   *   d(tool)/dq2 = z x r_2,     projected onto y2 = L2
   *
   * This is the lever that converts ANY angular error at a joint into the transverse
   * tool error -- gearbox wind-up, a following error, or a commanded pre-distortion --
   * so `tipError()`, the page's `toolTrackingError()` and every compensator have to use
   * the SAME one. They did not: two of them used `toolRadius()`, which is the MAGNITUDE
   * of the shoulder-to-tool vector rather than its projection. The two differ by a third
   * at a folded elbow and have OPPOSITE SIGNS at q2 = pi, where this returns -4.0 and the
   * radius returns +4.0.
   *
   * @returns {number[]} the transverse lever for each joint
   */
  toolLever() { return [this.L1 * Math.cos(this.q[1]) + this.L2, this.L2]; }

  /** Distance from the shoulder to the tool, which folds with the elbow. */
  toolRadius() {
    const [ex, ey] = rot(this.L1, 0, this.q[0]);
    const [tx, ty] = rot(this.L2, 0, this.q[0] + this.q[1]);
    return Math.hypot(ex + tx, ey + ty);
  }

  /**
   * WHERE THE TOOL ACTUALLY IS, in world coordinates — which a contouring machine needs
   * and a point-to-point one does not. Every other reading on this class is a scalar
   * transverse to link 2, because for a repeating move that is the whole story; a path
   * has a SHAPE, and a shape needs two coordinates.
   *
   * It is the same first-order construction `tipError()` decomposes, assembled instead of
   * projected: link 1 deformed, then link 2 attached at link 1's DEFORMED tip and rotated
   * by link 1's tip SLOPE as well as by the elbow.
   *
   * @param {boolean} [rigid] use the ENCODERS and no deflection — where the controller
   *   thinks the tool is, which is the other half of every comparison here.
   */
  toolXY(rigid = false) {
    const q1 = rigid ? this.j1.encoder().angle : this.q[0];
    const q2 = rigid ? this.j2.encoder().angle : this.q[1];
    const w1 = rigid ? 0 : tipDeflection(this.l1);
    const w2 = rigid ? 0 : tipDeflection(this.l2);
    const s1 = rigid ? 0 : tipSlope(this.l1);
    const c1 = Math.cos(q1), sn1 = Math.sin(q1);
    // Link 1's deformed tip: (L1, w1) in its own body frame.
    const ex = c1 * this.L1 - sn1 * w1;
    const ey = sn1 * this.L1 + c1 * w1;
    // Link 2's frame is attached there and carries link 1's tip slope as a rotation.
    const a2 = q1 + s1 + q2;
    const c2 = Math.cos(a2), sn2 = Math.sin(a2);
    return [ex + c2 * this.L2 - sn2 * w2, ey + sn2 * this.L2 + c2 * w2];
  }

  /**
   * INVERSE KINEMATICS, so a Cartesian path can be commanded at all.
   *
   * Analytic and two-branched: for a reachable point there are an elbow-up and an
   * elbow-down solution, and which one the machine is in matters — they have different
   * inertias, different gravity loads and different lever arms, so a path traced in one
   * is a different control problem from the same path traced in the other.
   *
   * IT REFUSES RATHER THAN CLAMPING. A point outside the annulus |L1-L2| .. L1+L2 has no
   * solution, and returning the nearest reachable one would silently turn a programming
   * error into a path the machine traces confidently and wrongly. That is the shape of
   * defect this project keeps finding, so it throws.
   *
   * @returns {number[]} [q1, q2]
   */
  ik(x, y, elbowUp = true) {
    const r2 = x * x + y * y;
    const r = Math.sqrt(r2);
    const { L1, L2 } = this;
    if (r > L1 + L2 - 1e-12 || r < Math.abs(L1 - L2) + 1e-12) {
      throw new Error(`(${x.toFixed(3)}, ${y.toFixed(3)}) is ${r.toFixed(3)} from the `
        + `shoulder, outside the reachable annulus ${Math.abs(L1 - L2).toFixed(3)}..`
        + `${(L1 + L2).toFixed(3)}`);
    }
    const c2 = (r2 - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    const q2 = (elbowUp ? 1 : -1) * Math.acos(Math.max(-1, Math.min(1, c2)));
    const q1 = Math.atan2(y, x) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
    return [q1, q2];
  }

  /**
   * The kinematic Jacobian d(tool)/d(q) at a pose, so a Cartesian feedrate can be turned
   * into joint rates. Rows are x and y; columns are the two joints.
   */
  jacobian(q1, q2) {
    const s1 = Math.sin(q1), c1 = Math.cos(q1);
    const s12 = Math.sin(q1 + q2), c12 = Math.cos(q1 + q2);
    return [[-this.L1 * s1 - this.L2 * s12, -this.L2 * s12],
      [this.L1 * c1 + this.L2 * c12, this.L2 * c12]];
  }

  /**
   * Joint rates and accelerations for a commanded Cartesian velocity and acceleration.
   * The acceleration needs the Jacobian's own derivative — dropping that term is the
   * classic way a Cartesian feedforward comes out wrong on a curve and right on a line,
   * because Jdot is zero only when the pose is not changing.
   */
  ikRates(q1, q2, vx, vy, ax, ay) {
    const J = this.jacobian(q1, q2);
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (Math.abs(det) < 1e-12) throw new Error('singular pose: the arm is straight');
    const inv = [[J[1][1] / det, -J[0][1] / det], [-J[1][0] / det, J[0][0] / det]];
    const dq1 = inv[0][0] * vx + inv[0][1] * vy;
    const dq2 = inv[1][0] * vx + inv[1][1] * vy;
    // Jdot * qdot, written out.
    const s1 = Math.sin(q1), c1 = Math.cos(q1);
    const s12 = Math.sin(q1 + q2), c12 = Math.cos(q1 + q2);
    const d12 = dq1 + dq2;
    const jx = -this.L1 * c1 * dq1 * dq1 - this.L2 * c12 * d12 * d12;
    const jy = -this.L1 * s1 * dq1 * dq1 - this.L2 * s12 * d12 * d12;
    return { dq: [dq1, dq2],
      ddq: [inv[0][0] * (ax - jx) + inv[0][1] * (ay - jy),
        inv[1][0] * (ax - jx) + inv[1][1] * (ay - jy)] };
  }

  /** What the controller can see: two motor-side encoders and nothing else. */
  encoders() { return [this.j1.encoder(), this.j2.encoder()]; }

  profiles() { return [deflectionProfile(this.l1), deflectionProfile(this.l2)]; }

  describe() {
    const M = this.massMatrix();
    return `2R: ${this.j1.describe()} + ${this.j2.describe()} | `
      + `L1=${this.L1} L2=${this.L2} M11=${M[0][0].toPrecision(4)} M12=${M[0][1].toPrecision(4)} `
      + `M22=${M[1][1].toPrecision(4)}`;
  }
}
