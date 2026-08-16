// Lattice units <-> physical (SI) units.
//
// The single most common way an LBM simulation is silently wrong is that
// somebody puts an SI number where a lattice number belongs. Lattice
// Boltzmann is only conditionally stable, and its stability conditions are
// stated in LATTICE units: the relaxation time must exceed 1/2, and the
// lattice velocity must stay well below the lattice speed of sound. So this
// engine never lets a physical quantity reach a solver without passing through
// here, and the conversion object states the resulting lattice numbers so they
// can be read and disbelieved.
//
// The scaling is fixed by three choices: dx (metres per cell), dt (seconds per
// step) and rho0 (the reference density). Everything else follows.

export const CS = Math.sqrt(1 / 3);      // lattice speed of sound

export class UnitSystem {
  /**
   * @param {object} o
   * @param {number} o.dx     metres per lattice cell
   * @param {number} o.dt     seconds per lattice step
   * @param {number} [o.rho0] reference density, kg/m^3 (1000 = water)
   */
  constructor({ dx, dt, rho0 = 1000 }) {
    if (!(dx > 0) || !(dt > 0)) throw new Error('dx and dt must be > 0');
    this.dx = dx; this.dt = dt; this.rho0 = rho0;
    this.cRef = dx / dt;                          // m/s represented by 1 lattice velocity
    this.nuRef = dx * dx / dt;                    // m^2/s represented by 1 lattice viscosity
  }

  /**
   * Choose dt from a target lattice velocity. This is the constructor most
   * setups actually want: you know the physical speed and the cell size, and
   * what you really want to pin is the lattice Mach number, because that is
   * what compressibility error and stability depend on.
   *
   * uLattice = uPhysical * dt / dx, so dt = uLattice * dx / uPhysical.
   */
  static fromVelocity({ dx, uPhysical, uLattice = 0.05, rho0 = 1000 }) {
    if (!(uPhysical > 0)) throw new Error('uPhysical must be > 0');
    return new UnitSystem({ dx, dt: uLattice * dx / uPhysical, rho0 });
  }

  velocityToLattice(u) { return u / this.cRef; }
  velocityToPhysical(u) { return u * this.cRef; }
  lengthToLattice(l) { return l / this.dx; }
  lengthToPhysical(l) { return l * this.dx; }
  timeToLattice(t) { return t / this.dt; }
  timeToPhysical(t) { return t * this.dt; }
  densityToPhysical(r) { return r * this.rho0; }
  densityToLattice(r) { return r / this.rho0; }

  /** Kinematic viscosity m^2/s -> lattice viscosity. */
  viscosityToLattice(nu) { return nu / this.nuRef; }
  viscosityToPhysical(nu) { return nu * this.nuRef; }

  /** Body force (N/m^3, i.e. force density) -> lattice force per unit density. */
  forceToLattice(f) { return f * this.dt * this.dt / (this.dx * this.rho0); }

  /**
   * BGK relaxation time from lattice viscosity: nu = cs^2 (tau - 1/2).
   * tau <= 1/2 is not merely inaccurate, it is a negative viscosity and the
   * simulation will blow up, so this refuses rather than clamping silently.
   */
  static tauFromLatticeViscosity(nuL) {
    const tau = nuL * 3 + 0.5;
    if (!(tau > 0.5)) throw new Error(`tau=${tau} <= 0.5: lattice viscosity ${nuL} is non-physical`);
    return tau;
  }

  static latticeViscosityFromTau(tau) { return (tau - 0.5) / 3; }

  /** Reynolds number from physical quantities -- dimensionless, so no conversion. */
  static reynolds(u, L, nu) { return u * L / nu; }

  /**
   * Report the lattice numbers a solver will actually see, plus the two
   * warnings that matter. Returned rather than logged so the UI can show them.
   */
  audit({ uPhysical, nuPhysical }) {
    const uL = this.velocityToLattice(uPhysical);
    const nuL = this.viscosityToLattice(nuPhysical);
    let tau = null, tauError = null;
    try { tau = UnitSystem.tauFromLatticeViscosity(nuL); } catch (e) { tauError = String(e.message); }
    const mach = uL / CS;
    const warnings = [];
    if (tau !== null && tau < 0.51) warnings.push(`tau=${tau.toFixed(4)} is very close to 1/2: expect instability`);
    if (tau !== null && tau > 2.5) warnings.push(`tau=${tau.toFixed(3)} is large: accuracy degrades and walls leak`);
    if (mach > 0.3) warnings.push(`lattice Mach ${mach.toFixed(3)} > 0.3: compressibility error is significant`);
    if (uL > 0.2) warnings.push(`lattice velocity ${uL.toFixed(3)} > 0.2: reduce dt`);
    return { uLattice: uL, nuLattice: nuL, tau, tauError, mach, warnings };
  }
}
