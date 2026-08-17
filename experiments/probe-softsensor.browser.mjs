/**
 * Dev-only driver for the probe soft-sensor experiment.
 *
 * The CPU reference backend runs this engine at ~0.2 MLUPS in Node, which puts a
 * few thousand samples of a shedding wake two hours away -- so the measurement
 * happens where the feature would actually run: in the browser, on the WGSL
 * kernels, through the same software adapter the smoke test uses.
 *
 *   node experiments/probe-softsensor.browser.mjs [--mode=bench|shed|run] [--res=N]
 *
 * Nothing here ships to the page. It exists to answer whether one probe cell
 * carries enough information to be worth putting a soft sensor on, before any UI
 * is built on the assumption that it does.
 */
// Resolved explicitly: playwright-core is a dev dependency installed under
// test/, and this file lives one directory over.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pw from '../test/node_modules/playwright-core/index.js';
const { chromium } = pw;

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=')[1] : d;
};
const MODE = arg('mode', 'bench');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8137/';

// Same discovery the smoke test uses: the bundled build's pinned revision is not
// what is installed here, so the binary is located rather than assumed.
function findChrome() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(root).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
    const p = join(root, d, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  throw new Error('No Chromium found. Set CHROME_BIN.');
}

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
});
const page = await browser.newPage();
page.setDefaultTimeout(0);
page.on('console', (m) => { if (m.type() !== 'debug') console.log('   ·', m.text()); });
page.on('pageerror', (e) => console.log('   ! pageerror', e.message));
await page.goto(BASE + 'lattsim.html', { waitUntil: 'domcontentloaded' });

/**
 * The scene: a nominally TWO-DIMENSIONAL cylinder wake.
 *
 * The shipped `channel` scene is the same flow in a cubic-ish box, and its span
 * is a free numerical parameter for a cylinder (CLAUDE.md's own point -- cells
 * spent on z resolve nothing about the wake). Taking that to its limit with a
 * 4-cell periodic span buys the resolution ACROSS the obstacle that decides
 * whether a vortex street exists at all, at a fraction of the cells.
 */
const SCENE = String((res, tau, u) => {
  const r = Math.max(4, Math.round(res * 0.115));
  const size = [res * 3, res, 4];
  const sim = new Sim({
    lattice: { size, spacing: 1e-3,
      topology: [TOP.BOUNDED, TOP.BOUNDED, TOP.PERIODIC] },
  });
  sim.addRegion(region.wall(CELL.SOLID, 1, -1)).addRegion(region.wall(CELL.SOLID, 1, +1));
  // One cell off the centreline: a perfectly symmetric obstacle above the
  // critical Reynolds number is an unstable EQUILIBRIUM with nothing but
  // round-off to grow from, and can look steady indefinitely.
  const cx = Math.round(res * 0.9), cy = (res >> 1) + 1;
  sim.addRegion(region.cylinder(CELL.SOLID, 2, [cx, cy], r));
  sim.addRegion(region.wall(CELL.INLET, 0, -1));
  sim.addRegion(region.wall(CELL.OUTLET, 0, +1));
  sim.addPhysics(new LBM({ tau, inletVelocity: [u, 0, 0], initialVelocity: [u, 0, 0],
    collision: 'trt', trtPolicy: 'stability', smagorinsky: 0.16 }));
  const nu = (tau - 0.5) / 3;
  sim.meta = { r, d: 2 * r, cx, cy, size, nu, reynolds: u * 2 * r / nu, reCell: u / nu };
  return sim;
});

/**
 * Run one routine inside the page, with the engine modules and the experiment
 * module imported there. Both the scene builder and the routine cross as SOURCE
 * and are rebuilt in page scope, so they can close over the page's imports.
 */
async function call(fn, args) {
  return page.evaluate(async ({ sceneSrc, bodySrc, args: a }) => {
    const here = location.href;
    const [{ Simulation }, { LBMFluidOperator }, { TOPOLOGY }, mat, exp] = await Promise.all([
      import(new URL('./lib/lattsim/simulation.js', here).href),
      import(new URL('./lib/lattsim/operators/lbm.js', here).href),
      import(new URL('./lib/lattsim/lattice.js', here).href),
      import(new URL('./lib/lattsim/materials.js', here).href),
      import(new URL('./experiments/probe-softsensor.js', here).href),
    ]);
    const X = { exp, region: mat.region, CELL: mat.CELL };
    const makeScene = new Function('Sim', 'LBM', 'TOP', 'region', 'CELL',
      `return (${sceneSrc});`)(Simulation, LBMFluidOperator, TOPOLOGY, mat.region, mat.CELL);
    const body = new Function(`return (${bodySrc});`)();
    return body(makeScene, X, a);
  }, { sceneSrc: SCENE, bodySrc: String(fn), args });
}

// ------------------------------------------------------------------ bench
if (MODE === 'bench') {
  const res = Number(arg('res', 60));
  const out = await call(async (scene, X, a) => {
    const sim = scene(a.res, 0.516, 0.08);
    await sim.build({ backend: 'webgpu' });
    sim.advance(50);                                  // warm the pipelines
    await sim.diagnostics();
    const t0 = performance.now();
    sim.advance(a.steps);
    await sim.diagnostics();                          // forces the queue to drain
    const s = (performance.now() - t0) / 1000;
    return { backend: sim.backend.kind, cells: sim.lattice.cellCount, meta: sim.meta,
      steps: a.steps, seconds: s, mlups: sim.lattice.cellCount * a.steps / s / 1e6 };
  }, { res, steps: 2000 });
  console.log(JSON.stringify(out, null, 2));
}

// ------------------------------------------------------------------ shed
// IS THERE ANYTHING TO PREDICT? Asked before any model is built. A steady flow
// scores every model perfectly against a constant target while teaching nothing.
if (MODE === 'shed') {
  const res = Number(arg('res', 60));
  const tau = Number(arg('tau', 0.516));
  const out = await call(async (scene, X, a) => {
    const sim = scene(a.res, a.tau, 0.08);
    await sim.build({ backend: 'webgpu' });
    const L = sim.lattice, m = sim.meta;
    // Five diameters downstream of the obstacle, on its centreline: where a
    // von Karman street is unmistakable and a steady wake is exactly flat.
    const wake = L.index(Math.min(L.nx - 2, m.cx + 5 * m.d), m.cy, L.nz >> 1);
    sim.advance(a.spin);
    const u = await X.exp.unsteadiness(sim, wake, { every: a.every, samples: a.samples });
    const d = await sim.diagnostics();
    return { meta: m, cells: L.cellCount, backend: sim.backend.kind, wake,
      unsteady: u, verdict: sim.stabilityVerdict ? sim.stabilityVerdict() : null,
      uMax: d.uMax, rho: [d.rhoMin, d.rhoMax], limited: d.limited };
  }, { res, tau, spin: 4000, every: 20, samples: 400 });
  console.log(JSON.stringify(out, null, 2));
}

// ------------------------------------------------------------------ run
if (MODE === 'run') {
  const res = Number(arg('res', 60));
  const tau = Number(arg('tau', 0.516));
  const out = await call(async (scene, X, a) => {
    const sim = scene(a.res, a.tau, 0.08);
    await sim.build({ backend: 'webgpu' });
    const L = sim.lattice, m = sim.meta;
    // THE PROBE IS WHERE YOU COULD ACTUALLY PUT ONE: hard against the wall,
    // two diameters downstream. In a real duct the wall is the only surface you
    // can instrument, and a wall sensor is blind to the wake by construction --
    // it sees only what the wake's pressure field imprints on it.
    const probeCell = L.index(Math.min(L.nx - 2, m.cx + 2 * m.d), 1, L.nz >> 1);
    // THE TARGET IS WHERE YOU COULD NOT: mid-wake, five diameters downstream.
    const hiddenCell = L.index(Math.min(L.nx - 2, m.cx + 5 * m.d), m.cy, L.nz >> 1);
    sim.advance(a.spin);
    const res0 = await X.exp.run(sim, { probeCell, hiddenCell,
      cfg: { every: a.every, warmup: a.warmup, train: a.train, score: a.score,
        horizon: a.horizon },
      log: (s) => console.log(s) });
    const d = await sim.diagnostics();
    return { meta: m, cells: L.cellCount, backend: sim.backend.kind,
      cells_used: { probeCell, hiddenCell }, result: res0,
      final: { uMax: d.uMax, rho: [d.rhoMin, d.rhoMax], limited: d.limited } };
  }, { res, tau, spin: 4000, every: 20, warmup: 250, train: 1200, score: 1200, horizon: 10 });
  console.log(JSON.stringify(out, null, 2));
}

await browser.close();
