// Materials and cell classification.
//
// Every cell carries one material id. The id is what the solver branches on:
// fluid cells collide and stream, solid cells bounce back, inlet cells are
// driven, outlet cells are open. Later physics adds properties to the same
// registry (thermal conductivity for heat, permittivity for EM) without the
// fluid solver knowing about them.
//
// Deliberately NOT a material database. It holds what the operators present
// actually read, and nothing else.

export const CELL = Object.freeze({
  FLUID: 0,
  SOLID: 1,      // no-slip wall, halfway bounce-back
  INLET: 2,      // prescribed velocity
  OUTLET: 3,     // open / zero-gradient
  MOVING: 4,     // prescribed wall velocity (lid-driven cavity and friends)
});

export const CELL_NAME = Object.freeze(
  Object.fromEntries(Object.entries(CELL).map(([k, v]) => [v, k]))
);

export class Material {
  /**
   * @param {object} o
   * @param {string} o.name
   * @param {number} o.cellType         one of CELL
   * @param {number} [o.density]        kg/m^3
   * @param {number} [o.viscosity]      kinematic, m^2/s
   * @param {number[]} [o.velocity]     m/s, for INLET / MOVING
   * @param {object} [o.thermal]        reserved for the heat operator
   */
  constructor({ name, cellType, density = 1000, viscosity = 1e-6, velocity = [0, 0, 0], thermal = null }) {
    this.name = name;
    this.cellType = cellType;
    this.density = density;
    this.viscosity = viscosity;
    this.velocity = velocity.slice();
    this.thermal = thermal;
  }
}

export class MaterialRegistry {
  constructor() {
    this.byName = new Map();
    this.list = [];
  }

  add(material) {
    if (this.byName.has(material.name)) throw new Error('duplicate material ' + material.name);
    this.byName.set(material.name, material);
    this.list.push(material);
    return material;
  }

  get(name) {
    const m = this.byName.get(name);
    if (!m) throw new Error('no such material: ' + name);
    return m;
  }
}

/**
 * Builds the per-cell material id array for a lattice.
 *
 * Regions are applied in order, so a later region overwrites an earlier one --
 * which is how "fill with fluid, then carve walls, then punch an inlet" reads
 * naturally. Each region is a predicate on (x, y, z, lattice), evaluated once
 * at setup; this is host-side and never a hot path.
 */
export function classify(lattice, regions) {
  const flags = new Uint32Array(lattice.cellCount);   // CELL.FLUID = 0
  for (const r of regions) {
    const t = r.cellType;
    lattice.forEachCell((x, y, z, i) => { if (r.test(x, y, z, lattice)) flags[i] = t; });
  }
  return flags;
}

/** Counts of each cell type -- shown in the UI so a mis-built geometry is visible. */
export function census(flags) {
  const out = {};
  for (let i = 0; i < flags.length; i++) {
    const n = CELL_NAME[flags[i]] || ('TYPE' + flags[i]);
    out[n] = (out[n] || 0) + 1;
  }
  return out;
}

// ---------------------------------------------------------------- regions

export const region = {
  all: (cellType) => ({ cellType, test: () => true }),

  /** Slab of `thickness` cells against one face. axis 0|1|2, side -1|+1. */
  wall: (cellType, axis, side, thickness = 1) => ({
    cellType,
    test: (x, y, z, L) => {
      const p = [x, y, z][axis];
      const n = L.size[axis];
      return side < 0 ? p < thickness : p >= n - thickness;
    },
  }),

  /** Sphere in lattice coordinates. */
  sphere: (cellType, [cx, cy, cz], r) => ({
    cellType,
    test: (x, y, z) => {
      const dx = x - cx, dy = y - cy, dz = z - cz;
      return dx * dx + dy * dy + dz * dz <= r * r;
    },
  }),

  /** Axis-aligned box, inclusive lower bound, exclusive upper. */
  box: (cellType, [x0, y0, z0], [x1, y1, z1]) => ({
    cellType,
    test: (x, y, z) => x >= x0 && x < x1 && y >= y0 && y < y1 && z >= z0 && z < z1,
  }),

  /** Cylinder along `axis`, centred at the other two coordinates. */
  cylinder: (cellType, axis, [a, b], r) => ({
    cellType,
    test: (x, y, z) => {
      const p = [x, y, z];
      const o = [0, 1, 2].filter((k) => k !== axis);
      const da = p[o[0]] - a, db = p[o[1]] - b;
      return da * da + db * db <= r * r;
    },
  }),

  custom: (cellType, test) => ({ cellType, test }),
};
