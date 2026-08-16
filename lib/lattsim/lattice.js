// The spatial lattice: geometry, indexing and topology. It owns no physics and
// no field data -- fields are allocated against it, operators read it.
//
// Indexing convention, used identically in JS, WGSL, boundaries and rendering:
//
//   index = x + Nx * (y + Ny * z)
//
// x fastest. Every backend and every shader repeats this exact expression; if
// it is ever changed it must be changed in wgsl.js at the same time, and
// test/lattsim/lattice.test.mjs pins the round trip.

export const TOPOLOGY = Object.freeze({
  PERIODIC: 'periodic',   // wraps
  BOUNDED: 'bounded',     // out-of-range neighbours are absent (the boundary
                          // system decides what happens there)
});

export class Lattice {
  /**
   * @param {object} o
   * @param {number[]} o.size      [Nx, Ny, Nz] in cells
   * @param {number}   o.spacing   dx in metres (SI); uniform for now, but every
   *                               consumer goes through this rather than
   *                               assuming 1, so non-unit spacing and later
   *                               refinement stay possible
   * @param {number[]} [o.origin]  world position of cell (0,0,0), metres
   * @param {string[]} [o.topology] per-axis TOPOLOGY, default all bounded
   */
  constructor({ size, spacing, origin = [0, 0, 0], topology }) {
    if (!Array.isArray(size) || size.length !== 3) throw new Error('lattice size must be [Nx,Ny,Nz]');
    if (size.some((n) => !Number.isInteger(n) || n < 2)) throw new Error('lattice dims must be integers >= 2');
    if (!(spacing > 0)) throw new Error('lattice spacing must be > 0');
    this.size = size.slice();
    this.spacing = spacing;
    this.origin = origin.slice();
    this.topology = (topology || [TOPOLOGY.BOUNDED, TOPOLOGY.BOUNDED, TOPOLOGY.BOUNDED]).slice();
    this.nx = size[0]; this.ny = size[1]; this.nz = size[2];
    this.cellCount = this.nx * this.ny * this.nz;
    this.strideY = this.nx;
    this.strideZ = this.nx * this.ny;
  }

  /** Linear index of a cell. No bounds checking -- callers own that. */
  index(x, y, z) { return x + this.nx * (y + this.ny * z); }

  /** Inverse of index(). */
  coords(i, out = [0, 0, 0]) {
    out[0] = i % this.nx;
    out[1] = ((i - out[0]) / this.nx) % this.ny;
    out[2] = Math.floor(i / this.strideZ);
    return out;
  }

  inside(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz;
  }

  /**
   * Neighbour index in direction (dx,dy,dz), honouring per-axis topology.
   * Returns -1 when the neighbour lies outside a bounded axis.
   */
  neighbor(x, y, z, dx, dy, dz) {
    let X = x + dx, Y = y + dy, Z = z + dz;
    if (this.topology[0] === TOPOLOGY.PERIODIC) X = (X + this.nx) % this.nx;
    else if (X < 0 || X >= this.nx) return -1;
    if (this.topology[1] === TOPOLOGY.PERIODIC) Y = (Y + this.ny) % this.ny;
    else if (Y < 0 || Y >= this.ny) return -1;
    if (this.topology[2] === TOPOLOGY.PERIODIC) Z = (Z + this.nz) % this.nz;
    else if (Z < 0 || Z >= this.nz) return -1;
    return this.index(X, Y, Z);
  }

  /** Cell centre in world (SI) coordinates. */
  position(x, y, z, out = [0, 0, 0]) {
    out[0] = this.origin[0] + (x + 0.5) * this.spacing;
    out[1] = this.origin[1] + (y + 0.5) * this.spacing;
    out[2] = this.origin[2] + (z + 0.5) * this.spacing;
    return out;
  }

  /** Physical extent in metres. */
  extent() { return [this.nx * this.spacing, this.ny * this.spacing, this.nz * this.spacing]; }

  /** Iterate every cell as (x, y, z, index). Host-side setup only -- never a hot path. */
  forEachCell(fn) {
    for (let z = 0; z < this.nz; z++) {
      for (let y = 0; y < this.ny; y++) {
        const rowBase = this.nx * (y + this.ny * z);
        for (let x = 0; x < this.nx; x++) fn(x, y, z, rowBase + x);
      }
    }
  }

  describe() {
    const e = this.extent();
    return `${this.nx}x${this.ny}x${this.nz} = ${this.cellCount.toLocaleString()} cells, `
      + `dx=${this.spacing} m, extent ${e.map((v) => v.toPrecision(3)).join(' x ')} m`;
  }
}
