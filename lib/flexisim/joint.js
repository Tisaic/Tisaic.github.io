// The lumped joint: gearbox, motor and the compliance that actually dominates.
//
// WHY THIS IS NOT A LATTICE OPERATOR. Joint compliance -- gearbox torsional
// stiffness, bearing compliance, harmonic-drive lost motion -- is commonly cited
// at 70-90% of an industrial arm's tip deflection. It is inherently ZERO
// dimensional: a torque in, an angle out, and a handful of nonlinear terms
// between them. Resolving it on a voxel lattice would be resolving the wrong
// thing at great cost, so FlexiSim is HYBRID by design and says so: joints are
// lumped, links are the lattice. `lib/flexisim` is the composition layer, the
// same shape `lib/probesense` has for the soft sensor.
//
// THE MODEL, and every term earns its place by being something a real drive does
// and a linear model cannot represent:
//
//   wind-up      d   = theta_motor / N - theta_link
//   transmitted  tau = K(d) d_eff + C (omega_motor/N - omega_link)
//   motor        J_m dw_m/dt = tau_cmd - tau/N - friction(w_m)
//   link         J_l dw_l/dt = tau - tau_load
//
//   N            gear ratio. The encoder sits on the MOTOR side and reads
//                theta_m/N, so it is structurally blind to everything downstream
//                of the gear teeth -- which is the whole reason a soft sensor has
//                anything to do here.
//   K(d)         PROGRESSIVE stiffness, K0 (1 + beta |d|). A harmonic drive is
//                softer near zero torque and stiffens under load; a constant K is
//                the textbook simplification and is exactly the thing an
//                identified-constants model can get right while a fixed one
//                cannot.
//   d_eff        backlash dead zone of half-width b: inside it NO torque is
//                transmitted and the link free-flies. Lost motion on reversal is
//                exactly 2b, which is a closed form and is checked.
//   friction     Stribeck on the motor side: stiction breaking away to Coulomb
//                at a characteristic speed, plus viscous. The canonical
//                unmodelable term.
//
// REFLECTED INERTIA IS THE PART PEOPLE GET WRONG. The motor's inertia appears at
// the load as N^2 J_m, so at a high ratio it DOMINATES the link's own inertia --
// a 100:1 drive with a 1e-4 kg m^2 rotor presents 1.0 kg m^2 at the output. Both
// closed forms below turn on that factor, so a missing or inverted N^2 fails them
// by orders of magnitude rather than subtly.
//
// INTEGRATION is semi-implicit Euler (velocity first, then position from the NEW
// velocity), the same scheme the NGRC soft-sensor plant uses. It is stable for
// this stiff-ish pair at sensible step sizes and it does not inject the energy a
// plain explicit Euler would.

const sign = (x) => (x > 0 ? 1 : (x < 0 ? -1 : 0));

/** Backlash dead zone: no torque transmitted while |d| <= b. */
export function deadZone(d, b) {
  if (b <= 0) return d;
  if (d > b) return d - b;
  if (d < -b) return d + b;
  return 0;
}

/**
 * Stribeck friction torque OPPOSING motion. Stiction tau_s falls to Coulomb
 * tau_c at the Stribeck speed vs, plus a viscous term.
 *
 * `tanh(w/eps)` rather than `sign(w)` on purpose: a hard sign is discontinuous at
 * zero, and an explicit integrator chatters across it at a frequency set by the
 * step size rather than by anything physical.
 */
export function stribeck(w, { tauS = 0, tauC = 0, vs = 1e-3, viscous = 0, eps = 1e-4 } = {}) {
  const s = Math.tanh(w / eps);
  const dry = tauC + (tauS - tauC) * Math.exp(-Math.abs(w) / vs);
  return dry * s + viscous * w;
}

export class Joint {
  /**
   * @param {object} o
   * @param {number} o.ratio        N, motor turns per output turn
   * @param {number} o.motorInertia J_m, motor-side (rotor + brake + coupling)
   * @param {number} o.loadInertia  J_l, load-side. For a lattice link this is the
   *   link's own inertia and the coupling is done elsewhere; it is here so the
   *   joint can be verified ALONE against closed forms, which is the only way to
   *   attribute a later discrepancy to the joint rather than to the link.
   * @param {number} o.stiffness    K0, torsional, load-side units
   * @param {number} [o.stiffening] beta in K = K0 (1 + beta |d|)
   * @param {number} [o.damping]    C, across the gearbox
   * @param {number} [o.backlash]   b, dead-zone HALF width (lost motion is 2b)
   * @param {object} [o.friction]   stribeck() parameters, motor side, plus an
   *   optional `stickSpeed` below which the motor is treated as at rest
   */
  constructor({ ratio, motorInertia, loadInertia, stiffness, stiffening = 0,
                damping = 0, backlash = 0, friction = null } = {}) {
    if (!(ratio > 0)) throw new Error('gear ratio must be > 0');
    if (!(motorInertia > 0) || !(loadInertia > 0)) throw new Error('both inertias must be > 0');
    if (!(stiffness > 0)) throw new Error('stiffness must be > 0');
    if (!(backlash >= 0)) throw new Error('backlash must be >= 0');
    Object.assign(this, {
      N: ratio, Jm: motorInertia, Jl: loadInertia, K0: stiffness,
      beta: stiffening, C: damping, b: backlash, friction,
    });
    this.reset();
  }

  reset(thetaMotor = 0, thetaLink = 0) {
    this.thM = thetaMotor; this.wM = 0;
    this.thL = thetaLink;  this.wL = 0;
    return this;
  }

  /** Wind-up across the gearbox, in LOAD-side radians. */
  windup() { return this.thM / this.N - this.thL; }

  /** Torque delivered to the link. Zero inside the backlash dead zone. */
  transmitted() {
    const d = deadZone(this.windup(), this.b);
    if (d === 0 && this.b > 0) return 0;
    const K = this.K0 * (1 + this.beta * Math.abs(d));
    return K * d + this.C * (this.wM / this.N - this.wL);
  }

  /**
   * Inertia the drive presents at the OUTPUT, N^2 J_m + J_l. At a high ratio the
   * first term dominates, which is why a per-joint model that forgets it is not
   * merely imprecise but wrong by orders of magnitude.
   */
  reflectedInertia() { return this.N * this.N * this.Jm + this.Jl; }

  /**
   * Undamped two-mass natural frequency, the classic gearbox resonance:
   *   w_n = sqrt( K (1/J_l + 1/(N^2 J_m)) )
   * i.e. the stiffness against the two inertias in series. Verified directly.
   */
  naturalFrequency() {
    return Math.sqrt(this.K0 * (1 / this.Jl + 1 / (this.N * this.N * this.Jm)));
  }

  /**
   * THE JOINT HAS ITS OWN STABILITY LIMIT, and it is a different one from the
   * lattice's. Semi-implicit Euler on a two-mass oscillator is stable only for
   * w_n * dt < 2, and the gearbox resonance can be orders of magnitude above the
   * link's first bending mode -- which is exactly the regime a high-ratio drive
   * with a stiff gearbox lives in. Coupling the two without checking gives NaN in
   * a few hundred steps and no clue which half produced it.
   *
   * Refused at build time rather than discovered, for the same reason the elastic
   * operator refuses c_p >= 1/sqrt(3): an explicit scheme past its limit does not
   * degrade, it explodes.
   */
  assertStable(dt, margin = 0.5) {
    const wdt = this.naturalFrequency() * dt;
    if (!(wdt < 2 * margin)) {
      throw new Error(`joint: w_n*dt = ${wdt.toPrecision(4)} is past the semi-implicit `
        + `limit (${(2 * margin).toPrecision(3)}). w_n = ${this.naturalFrequency().toPrecision(4)} `
        + `rad/step from K=${this.K0}, N^2 J_m=${(this.N * this.N * this.Jm).toPrecision(4)}, `
        + `J_l=${this.Jl.toPrecision(4)}. Soften the gearbox, raise the motor inertia, `
        + 'or shorten the timestep.');
    }
    return this;
  }

  /**
   * One step. Semi-implicit Euler: velocities from the current torques, then
   * positions from the NEW velocities.
   *
   * @param {number} tauCmd   commanded motor torque (motor side)
   * @param {number} tauLoad  external torque on the link (load side), e.g.
   *                          gravity or the reaction from a lattice link
   * @param {number} dt
   */
  step(tauCmd, tauLoad, dt) {
    const tau = this.transmitted();
    const net = tauCmd - tau / this.N;          // torque available at the motor

    // STICTION IS A STATE, NOT A LARGE FRICTION COEFFICIENT, and treating it as
    // the latter is a classic and very convincing bug. The Stribeck curve is
    // exactly zero at w = 0, so a motor at rest under a sub-breakaway torque
    // always takes off; the next step it is moving, full stiction applies, it is
    // pushed back to rest, and it takes off again. Measured before this was a
    // state machine: a 0.5 N m command against a 0.9 N m breakaway walked the
    // motor 2.4e-2 rad in one second, in a clean limit cycle at a frequency set
    // by dt. It reads exactly like creep and it is a discretisation artefact.
    //
    // So: at rest with less than breakaway applied, the motor STAYS at rest --
    // static friction balances whatever is offered, which is what static friction
    // is. And a sliding motor that would reverse WITHIN a step under friction
    // alone is stopped at zero instead of shot through it, because friction is
    // dissipative and cannot drive anything.
    if (this.friction) {
      const { tauS = 0, stickSpeed = 1e-9 } = this.friction;
      if (Math.abs(this.wM) <= stickSpeed && Math.abs(net) <= tauS) {
        this.wM = 0;
      } else {
        const fr = stribeck(this.wM, this.friction);
        const next = this.wM + (dt / this.Jm) * (net - fr);
        const reversed = this.wM !== 0 && sign(next) !== 0 && sign(next) !== sign(this.wM);
        this.wM = (reversed && Math.abs(net) <= tauS) ? 0 : next;
      }
    } else {
      this.wM += (dt / this.Jm) * net;
    }

    this.wL += (dt / this.Jl) * (tau - tauLoad);
    this.thM += dt * this.wM;
    this.thL += dt * this.wL;
    return this;
  }

  /** What the CONTROLLER can see: motor-side only. The link angle is not in it. */
  encoder() { return { angle: this.thM / this.N, speed: this.wM / this.N }; }

  /** The truth a laser tracker would give during commissioning. */
  truth() { return { angle: this.thL, speed: this.wL, windup: this.windup() }; }

  describe() {
    return `joint N=${this.N} K=${this.K0} J_refl=${this.reflectedInertia().toPrecision(4)} `
      + `w_n=${this.naturalFrequency().toPrecision(4)} rad/s`
      + (this.b ? ` backlash ${2 * this.b} rad lost motion` : '');
  }
}
