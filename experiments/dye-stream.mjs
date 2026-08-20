// ONE PHYSICS RUN, REPLAYED BY EVERY ARM.
//
// The noise experiments differ only in what is added to the sensor readings and
// in how the readout is regularised. If each arm ran its own simulation the rows
// would also differ by the flow, and this project has already been bitten by
// exactly that (the ridge sweep on the mech tab feeds ONE stream for the same
// reason). So the lattice is advanced once, the sensor scans and the field truth
// are recorded, and every arm reads the same arrays.
//
// Geometry matches `recon-gate.mjs`, which is the configuration whose blind
// reconstruction was measured at nRMSE 0.0791 -- so any degradation reported here
// is measured against a number that was already validated.
import { channelFlow } from '../lib/lattsim/scenes.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

export const PHYS = { collision: 'trt', trtPolicy: 'stability', smagorinsky: 0.16 };

// The lattice run is minutes and is IDENTICAL for every arm, so it is cached on
// disk keyed by the parameters that produce it. Scratch only -- a stale cache is
// a silent wrong answer, so the key carries every argument and the solver
// settings, and deleting the directory is always safe.
const CACHE = process.env.DYE_CACHE || '.dye-cache';

/**
 * @param {object} o
 * @param {number} [o.res] resolution ladder rung
 * @param {number} [o.u] inlet velocity
 * @param {number} [o.every] solver steps between samples
 * @param {number} [o.samples] scans to record
 * @param {number} [o.perWall] wall taps per wall, evenly spaced over a fixed span
 * @param {number} [o.flush] transits to settle before recording
 */
export async function dyeStream(opts = {}) {
  // THE INLET DISTURBANCE IS NOT A FLOURISH, IT IS WHAT MAKES THE TASK EXIST.
  // The scalar is one-way coupled -- the dye is advected by the flow and never
  // acts on it -- so a wall tap can only learn about the plume THROUGH the
  // velocity field. If the flow is steady the plume is a fixed function of it,
  // a constant per location reconstructs the field exactly, and the sensors are
  // not merely unhelpful but unnecessary. Measured: on a steady stream a static
  // map scored 1.7e-3 while the reconstructor scored 0.086. Driving the inlet is
  // what gives the wall something to see and the interior something to do.
  const { res = 16, u = 0.06, every = 2, samples = 1600, perWall = 6, flush = 2,
    inletMode = 'steady', inletAmplitude = 0, inletRate = 0.004 } = opts;
  const key = `${res}_${u}_${every}_${samples}_${perWall}_${flush}`
    + `_${inletMode}_${inletAmplitude}_${inletRate}_${JSON.stringify(PHYS)}`
      .replace(/[^\w.-]/g, '');
  const path = `${CACHE}/${key}.json`;
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return { ...raw,
      sig: raw.sig.map((r) => Float64Array.from(r)),
      truth: raw.truth.map((r) => Float64Array.from(r)),
      mean: Float64Array.from(raw.mean), std: Float64Array.from(raw.std) };
  }
  const sim = channelFlow({ resolution: res, obstacle: 'cylinder', inletVelocity: u,
    dye: true, inletMode, inletAmplitude, inletRate, ...PHYS });
  await sim.build({ backend: 'cpu' });
  const L = sim.lattice, zc = L.nz >> 1, N = L.cellCount;
  // TRANSITS, not a residual threshold: a slow transient sits below the
  // convergence threshold while the flow is still crossing the domain.
  const transit = Math.ceil(L.nx / u);
  sim.advance(flush * transit);

  // THE SPAN IS FIXED AND ONLY THE DENSITY CHANGES, which is what lets a later
  // experiment subsample this record into a sensor-COUNT ladder without also
  // changing the LAYOUT. Getting that wrong turns a count study into a layout
  // study, and this project has already measured layout as worth 2.4x.
  const sensors = [];
  for (const yw of [1, L.ny - 2]) for (let s = 0; s < perWall; s++) {
    const x = Math.min(L.nx - 1, Math.round(L.nx * (0.1 + 0.85 * s / (perWall - 1))));
    const i = L.index(x, yw, zc);
    if (sim.flags[i] !== 1) sensors.push(i);
  }
  const target = [];
  for (let y = 0; y < L.ny; y += 2) for (let x = 0; x < L.nx; x += 2) {
    const i = L.index(x, y, zc);
    if (sim.flags[i] !== 1) target.push(i);
  }

  // Per sensor the scan is [u_x, u_y, rho] -- so channel 3s+2 is the PRESSURE
  // slot, which is the one a shared thermal coefficient moves. Recorded as the
  // layout rather than assumed, because the common-mode arms index into it.
  const P = sensors.length * 3;
  const rhoSlots = sensors.map((_, s) => 3 * s + 2);
  const sig = [], truth = [];
  for (let t = 0; t < samples; t++) {
    sim.advance(every);
    const mac = sim.backend.read('macro');
    const row = new Float64Array(P);
    for (let s = 0; s < sensors.length; s++) {
      const c = sensors[s];
      row[3 * s] = mac[N + c]; row[3 * s + 1] = mac[2 * N + c]; row[3 * s + 2] = mac[c];
    }
    sig.push(row);
    const conc = sim.backend.read('conc');
    truth.push(Float64Array.from(target, (i) => conc[i]));
  }
  const diag = await sim.diagnostics();
  sim.destroy();

  // Per-channel spread over the record. Every noise magnitude below is quoted as
  // a FRACTION OF THIS, because a fraction of full scale cannot be mapped into
  // lattice units without inventing a transducer range -- and the estimator only
  // ever sees the ratio.
  const mean = new Float64Array(P), std = new Float64Array(P);
  for (const r of sig) for (let i = 0; i < P; i++) mean[i] += r[i] / sig.length;
  for (const r of sig) for (let i = 0; i < P; i++) std[i] += (r[i] - mean[i]) ** 2 / sig.length;
  for (let i = 0; i < P; i++) std[i] = Math.sqrt(std[i]);

  const out = { sig, truth, mean, std, P, rhoSlots, sensors, target, perWall,
    inletMode, inletAmplitude, inletRate,
    size: [L.nx, L.ny, L.nz], cells: N, transit, limited: diag.limited,
    residual: diag.residual };
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(path, JSON.stringify({ ...out,
    sig: sig.map((r) => [...r]), truth: truth.map((r) => [...r]),
    mean: [...mean], std: [...std] }));
  return out;
}

/** rms(estimate - truth) / spatial std(truth), over one field snapshot. */
export function fieldNrmse(est, truth) {
  let m = 0;
  for (const y of truth) m += y;
  m /= truth.length;
  let se = 0, sd = 0;
  for (let j = 0; j < truth.length; j++) {
    se += (est[j] - truth[j]) ** 2; sd += (truth[j] - m) ** 2;
  }
  return Math.sqrt(se / Math.max(sd, 1e-30));
}

/** Deterministic normal draws, so every arm sees the same realisation. */
export function rng(seed) {
  let s = seed >>> 0;
  const u = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}
