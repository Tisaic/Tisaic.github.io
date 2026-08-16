// Field descriptors and the field registry.
//
// A field is DESCRIBED here and ALLOCATED by a backend. That split is what
// keeps the engine from being an LBM engine: the solver, the boundary system
// and the renderer all talk about "the field named density with 1 component",
// never about "the f array". Adding heat later means registering a scalar
// field and an operator that reads and writes it -- no core change.
//
// Layout is structure-of-arrays throughout:
//
//   value(component, cell) = data[component * cellCount + cell]
//
// so a component is contiguous across cells. On the GPU that is what makes
// adjacent threads read adjacent memory; on the CPU it is what keeps the
// reference implementation's inner loop from striding.

export const FIELD_KIND = Object.freeze({
  SCALAR: 'scalar',            // 1 component  (density, temperature, pressure)
  VECTOR: 'vector',            // 3 components (velocity, momentum, E, B)
  TENSOR: 'tensor',            // 9 components (stress, strain)
  DISTRIBUTION: 'distribution',// Q components (LBM populations)
  MATERIAL: 'material',        // 1 integer component (material / boundary id)
});

const COMPONENTS = {
  [FIELD_KIND.SCALAR]: 1,
  [FIELD_KIND.VECTOR]: 3,
  [FIELD_KIND.TENSOR]: 9,
  [FIELD_KIND.MATERIAL]: 1,
};

export class FieldSpec {
  /**
   * @param {object} o
   * @param {string} o.name
   * @param {string} o.kind        FIELD_KIND
   * @param {number} [o.components] required for DISTRIBUTION, implied otherwise
   * @param {boolean} [o.doubleBuffered] true for anything an operator advances
   *                                     in time (see solver.js -- read and
   *                                     write must never be the same buffer)
   * @param {string} [o.dtype]     'f32' | 'u32'
   * @param {string} [o.units]     free text, for the UI and for humans
   */
  constructor({ name, kind, components, doubleBuffered = false, dtype = 'f32', units = '' }) {
    if (!name) throw new Error('field needs a name');
    if (!COMPONENTS[kind] && kind !== FIELD_KIND.DISTRIBUTION) throw new Error('unknown field kind ' + kind);
    if (kind === FIELD_KIND.DISTRIBUTION && !(components > 0)) {
      throw new Error('distribution field needs an explicit component count');
    }
    // An explicit component count wins over the kind's default. Kinds carry
    // meaning for the renderer and the UI; padding is a storage decision. The
    // LBM macro field is the live case: it is a velocity plus a density,
    // packed as 4 so it is one 16-byte fetch and one rgba32float texel.
    if (components != null && (!Number.isInteger(components) || components < 1)) {
      throw new Error('components must be a positive integer');
    }
    this.name = name;
    this.kind = kind;
    this.components = components != null ? components : COMPONENTS[kind];
    this.doubleBuffered = !!doubleBuffered;
    this.dtype = kind === FIELD_KIND.MATERIAL ? 'u32' : dtype;
    this.units = units;
  }

  /** Bytes for one buffer of this field over `cellCount` cells. */
  byteLength(cellCount) { return this.components * cellCount * 4; }
}

export class FieldRegistry {
  constructor(lattice) {
    this.lattice = lattice;
    this.specs = new Map();
  }

  add(spec) {
    if (this.specs.has(spec.name)) throw new Error('duplicate field ' + spec.name);
    this.specs.set(spec.name, spec);
    return spec;
  }

  get(name) {
    const s = this.specs.get(name);
    if (!s) throw new Error('no such field: ' + name);
    return s;
  }

  has(name) { return this.specs.has(name); }
  list() { return [...this.specs.values()]; }

  /** Total bytes, counting the second buffer of anything double-buffered. */
  byteLength() {
    let total = 0;
    for (const s of this.specs.values()) {
      total += s.byteLength(this.lattice.cellCount) * (s.doubleBuffered ? 2 : 1);
    }
    return total;
  }

  /**
   * Memory report, itemised. A D3Q19 lattice is memory-hungry in a way that
   * surprises people -- 19 floats per cell, doubled for ping-pong, is 152
   * bytes per cell before anything else -- so the engine states the number up
   * front rather than letting an allocation fail at 256^3.
   */
  report() {
    const n = this.lattice.cellCount;
    const items = this.list().map((s) => ({
      name: s.name,
      kind: s.kind,
      components: s.components,
      buffers: s.doubleBuffered ? 2 : 1,
      bytes: s.byteLength(n) * (s.doubleBuffered ? 2 : 1),
    }));
    return { cells: n, bytes: this.byteLength(), items };
  }
}

export function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KiB';
  if (b < 1024 * 1024 * 1024) return (b / 1048576).toFixed(1) + ' MiB';
  return (b / 1073741824).toFixed(2) + ' GiB';
}
