// The hybrid arm: a lumped joint driving a lattice link, stepped together.
//
// THIS IS WHERE THE TWO HALVES MEET, and the meeting is the part with sign errors
// in it, so every term below has a closed form attached in test/flexisim/arm.test.mjs.
//
// THE SCHEME IS THE STANDARD FLOATING FRAME OF REFERENCE. The joint owns the
// link's RIGID rotation: its load-side inertia is the link's own second moment,
// integrated from the lattice rather than stated separately, so a lightening hole
// or a changed section cannot drift out of agreement with the thing being
// simulated. The lattice then carries only the DEFORMATION, in a frame that
// rotates with the joint -- which is what keeps the link's own lattice small and
// axis-aligned, and which is exactly why the fictitious forces in
// operators/frame.js are not optional.
//
// Each step:
//   1. the joint integrates against the torque the link is putting on it
//   2. the link's frame takes the joint's new angle, rate and acceleration
//   3. world gravity is rotated into that frame
//   4. the lattice advances one step
//   5. the link's body-frame angular momentum is re-read, and its RATE OF CHANGE
//      is the elastic coupling torque the joint sees on the next step
//
// THE ONE-STEP LAG IN (5) IS DELIBERATE AND IS WHAT MAKES THIS A STAGGERED
// CO-SIMULATION rather than a monolithic solve. Resolving the coupling implicitly
// would need the link's response to a torque it has not been given yet. At these
// step sizes the lag is far below the gearbox period and the closed forms below
// hold to a fraction of a percent; if that ever stops being true the symptom will
// be an energy drift, which is why the tests measure a steady state rather than a
// single step.

import { CELL } from '../lattsim/materials.js';
import { massProperties, gravityTorque, tipDeflection, armLength } from './link.js';

/**
 * Angular momentum of the link's DEFORMATION about the pivot, in the body frame.
 * The rigid rotation is not in it -- that lives in the joint -- so this is purely
 * the flexible part, and its rate of change is the torque the flexing link feeds
 * back to the gearbox.
 */
export function bodyAngularMomentum(sim) {
  const { pivot, rho, H } = sim.meta;
  const L = sim.lattice, N = L.cellCount;
  const v = sim.backend.read('vel');
  let Hz = 0;
  L.forEachCell((x, y, z, i) => {
    const t = sim.flags[i];
    if (t !== CELL.ELASTIC && t !== CELL.CLAMPED) return;
    const rx = x - pivot[0], ry = y - pivot[1];
    // (r x v)_z = rx*vy - ry*vx. Each velocity component is read at its own
    // staggered node, so each gets the r that belongs to it.
    Hz += rho * ((rx * v[N + i]) - (ry * v[i]));
    void z;
  });
  void H;
  return Hz;
}

export class FlexArm {
  /**
   * @param {Joint} joint            the gearbox and motor
   * @param {Simulation} link        a lattice link from buildLink()
   * @param {number[]} [gravityWorld] gravity in WORLD coordinates; it is rotated
   *   into the link's frame every step, which is the whole reason a pose-dependent
   *   compliance exists at all.
   */
  constructor({ joint, link, gravityWorld = [0, 0, 0], dt = null }) {
    this.joint = joint;
    this.link = link;
    this.gWorld = gravityWorld.slice();
    // THE LOAD-SIDE INERTIA IS THE LATTICE'S OWN, overwritten here rather than
    // trusted from the caller. A joint constructed with one inertia and driving a
    // link with another is a physics error whose only symptom is a wrong
    // acceleration, and nothing else in the model would notice.
    const mp = massProperties(link);
    this.joint.Jl = mp.inertiaAboutPivot;
    this.mp = mp;
    this.Larm = armLength(link);
    // The joint's stability limit depends on the inertia just installed, so it is
    // checked HERE and not by the caller -- who cannot know J_l until this point.
    if (dt != null) this.joint.assertStable(dt);
    this._wPrev = joint.wL;
    this._residual = 0;
    this._rigidTorque = 0;
    this._alpha = 0;
    // buildLink() already asked the elastic operator for the clamp reaction (it
    // has to happen before build()); this just finds the kernel accumulating it.
    this.elasticKernel = link.solver.kernels
      .map((k) => k.kernel).find((k) => k.react !== undefined);
  }

  /** Frame operator (added first by buildLink) and elastic operator. */
  get frameOp() { return this.link.operators[0]; }
  get elasticOp() { return this.link.operators[1]; }

  step(tauCmd, dt) {
    const j = this.joint;
    // Gravity in the link's frame. theta is the link angle, so the world vector
    // rotates by -theta into the body frame. This is where pose-dependent
    // compliance comes from: the same arm sags differently at different angles
    // because the gravity torque about the joint changes with pose.
    const c = Math.cos(-j.thL), s0 = Math.sin(-j.thL);
    const gx = c * this.gWorld[0] - s0 * this.gWorld[1];
    const gy = s0 * this.gWorld[0] + c * this.gWorld[1];

    // (1) the joint carries the link's RIGID rotation, against gravity.
    const tauG = gravityTorque(this.link, [gx, gy, 0]);
    j.step(tauCmd, -tauG, dt);

    // (2)(3) the frame follows the joint; alpha from the rate it just changed at.
    const alpha = (j.wL - this._wPrev) / dt;
    this._wPrev = j.wL;
    this.frameOp.setParams({ gravity: [gx, gy, 0], omega: [0, 0, j.wL],
      alpha: [0, 0, alpha] });

    // (4) the lattice carries the DEFORMATION, in that rotating frame.
    this.link.advance(1);

    // (5) WHAT WAS NEGLECTED, MEASURED rather than asserted. The link's clamp
    // reaction is the total torque it puts on the gearbox; the rigid part of that
    // is already in the joint's own inertia, so what a two-way coupling would add
    // is the RESIDUAL below. Reporting it makes the approximation quantified
    // instead of a hand-wave -- see couplingResidual().
    const react = this.elasticKernel && this.elasticKernel.react;
    if (react) {
      const rigid = -this.mp.inertiaAboutPivot * alpha - tauG;
      this._residual = react.mz - rigid;
      this._rigidTorque = rigid;
    }
    this._alpha = alpha;
    return this;
  }

  /**
   * The torque a TWO-WAY coupling would add, against the rigid torque already
   * accounted for. Small by assumption -- the deformation's back-reaction on the
   * rigid motion is second order in the deformation amplitude -- and measured so
   * that assumption is a number rather than a hope.
   *
   * TWO-WAY COUPLING IS NOT SHIPPED, AND THE REASON IS MEASURED. Feeding the
   * link's reaction back explicitly, with the one-step lag a staggered
   * co-simulation has, went unstable at ~1200 steps in every configuration tried
   * -- at lattice damping 0, 1e-4, 3e-4 and 1e-3 alike, so it is a gain-driven
   * instability of the lag and not a lightly damped resonance. The first
   * formulation made it worse by differencing the link's angular momentum, which
   * is a high-pass filter on a field with grid-scale content; the clamp reaction
   * above is local and exact and needs no derivative, which removes that half of
   * the problem but not the lag. A stable two-way coupling needs sub-cycling or an
   * iterated (implicit) exchange, and that is its own brick.
   */
  couplingResidual() {
    return { residual: this._residual || 0, rigid: this._rigidTorque || 0,
      ratio: this._rigidTorque ? Math.abs(this._residual / this._rigidTorque) : 0 };
  }

  /** Rigid-body inertia the drive sees at its output, including the reflection. */
  reflectedInertia() { return this.joint.reflectedInertia(); }

  /**
   * Tip position error transverse to the link, in world units: the rigid tilt the
   * gearbox wind-up introduces PLUS the link's own bending. This is what a laser
   * tracker measures and what the encoder cannot see.
   */
  tipError() {
    const bend = tipDeflection(this.link);
    const tilt = this.joint.windup() * this.Larm;
    return { bend, tilt, total: bend + tilt };
  }

  /** What the controller has: motor-side only. */
  encoder() { return this.joint.encoder(); }

  describe() {
    return `${this.joint.describe()} | link J=${this.mp.inertiaAboutPivot.toPrecision(4)} `
      + `m=${this.mp.mass} arm=${this.Larm}`;
  }
}
