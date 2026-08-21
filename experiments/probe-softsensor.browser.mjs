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
await page.goto(BASE + 'flowsim.html', { waitUntil: 'domcontentloaded' });

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
    const scenes = await import(new URL('./lib/lattsim/scenes.js', here).href);
    const X = { exp, scenes, region: mat.region, CELL: mat.CELL };
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
    const x2 = Math.min(L.nx - 2, m.cx + 2 * m.d);
    // WHERE THE PROBE GOES IS THE EXPERIMENT, so it is a variable rather than a
    // choice buried in the code.
    //   wall  hard against the no-slip wall, two diameters downstream. In a real
    //         duct the wall is the only surface you can instrument, and a wall
    //         sensor is blind to the wake by construction -- it sees only what
    //         the wake's pressure field imprints on it. This is the real task.
    //   wake  in the wake itself. The CONTROL: a probe that sees the oscillation
    //         directly must do better, and the gap between the two is how much
    //         information the wall actually carries.
    //   near  one diameter off the centreline: neither, and a check that the
    //         answer moves smoothly between them rather than being a knife edge.
    const probeCell = a.probe === 'wake' ? L.index(x2, m.cy, L.nz >> 1)
      : a.probe === 'near' ? L.index(x2, m.cy - m.d, L.nz >> 1)
        : L.index(x2, 1, L.nz >> 1);
    // THE TARGET IS WHERE YOU COULD NOT: mid-wake, five diameters downstream.
    const hiddenCell = L.index(Math.min(L.nx - 2, m.cx + 5 * m.d), m.cy, L.nz >> 1);
    sim.advance(a.spin);
    // The wake's own numbers, alongside the model's, so the scores can never be
    // read without the thing they were scored against.
    const shed = await X.exp.unsteadiness(sim, hiddenCell, { every: a.every, samples: 200 });
    const res0 = await X.exp.run(sim, { probeCell, hiddenCell,
      cfg: { every: a.every, warmup: a.warmup, train: a.train, score: a.score,
        horizon: a.horizon },
      log: (s) => console.log(s) });
    const d = await sim.diagnostics();
    return { meta: m, cells: L.cellCount, backend: sim.backend.kind, probe: a.probe,
      cells_used: { probeCell, hiddenCell }, shed, result: res0,
      final: { uMax: d.uMax, rho: [d.rhoMin, d.rhoMax], limited: d.limited } };
  }, { res, tau, probe: arg('probe', 'wall'), spin: 4000, every: 20,
    warmup: 250, train: 1200, score: 1200,
    // HALF A SHEDDING PERIOD. Measured at res 48: 29 zero crossings over 8000
    // steps is a period near 550 steps, so 14 samples of 20 steps lands at the
    // antiphase point -- exactly where persistence is worst, which is the
    // strongest test a forecast can be given.
    horizon: Number(arg('horizon', 14)) });
  console.log(JSON.stringify(out, null, 2));
}


// ------------------------------------------------------------------ io
// How much of the clock is the READBACK rather than the physics? A probe is
// 16 bytes, but it is 16 bytes behind a queue flush and a mapAsync round trip,
// and on a software adapter that is not obviously cheap. Measured before any
// effort is spent making it cheaper.
if (MODE === 'io') {
  const out = await call(async (scene, X, a) => {
    const sim = scene(a.res, 0.516, 0.08);
    await sim.build({ backend: 'webgpu' });
    sim.advance(50);
    await sim.diagnostics();
    const c0 = sim.lattice.index(60, 12, 1), c1 = sim.lattice.index(100, 25, 1);
    let t = performance.now();
    sim.advance(a.steps);
    await sim.diagnostics();
    const stepMs = (performance.now() - t) / a.steps;
    t = performance.now();
    for (let i = 0; i < a.reads; i++) await sim.backend.probe('macro', c0);
    const oneMs = (performance.now() - t) / a.reads;
    t = performance.now();
    for (let i = 0; i < a.reads; i++) {
      await sim.backend.probe('macro', c0); await sim.backend.probe('macro', c1);
    }
    const twoMs = (performance.now() - t) / a.reads;
    return { stepMs, oneProbeMs: oneMs, twoProbesMs: twoMs,
      perSampleMs: a.every * stepMs + twoMs,
      readbackShare: twoMs / (a.every * stepMs + twoMs) };
  }, { res: Number(arg('res', 48)), steps: 400, reads: 200, every: 20 });
  console.log(JSON.stringify(out, null, 2));
}

// ------------------------------------------------------------------ chaos
// THE SHIPPED SCENE AT THE SHIPPED SLIDER EXTREMES, because the question is
// about what the page does, not about a domain invented for the experiment.
// Viscosity to the far left (tau 0.5015) and inlet speed to the far right
// (0.14) is Re_cell 280 -- past the LES model's measured ceiling of 200 -- so
// the limiter is expected to be holding it, and how much is reported rather
// than glossed. A flow held up by a clamp is a different object from a flow
// that is solved, and a soft-sensor score on one is not a score on the other.
if (MODE === 'chaos') {
  const out = await call(async (scene, X, a) => {
    const PHYS = { collision: 'trt', trtPolicy: 'stability', smagorinsky: 0.16 };
    const rows = [];
    for (const c of a.configs) {
      const sim = X.scenes.channelFlow({ resolution: a.res, tau: c.tau,
        inletVelocity: c.u, obstacle: 'cylinder', ...PHYS });
      await sim.build({ backend: 'webgpu' });
      const L = sim.lattice, m = sim.meta, d = m.obstacleCells;
      const cx = Math.round(a.res * 0.9), cy = (a.res >> 1) + 1;
      const wake = L.index(Math.min(L.nx - 2, cx + 5 * d), cy, L.nz >> 1);
      const wall = L.index(Math.min(L.nx - 2, cx + 2 * d), 1, L.nz >> 1);
      sim.advance(a.spin);
      const rec = await X.exp.record(sim, wake, { every: a.every, samples: a.samples });
      const recW = await X.exp.record(sim, wall, { every: a.every, samples: 100 });
      const dg = await sim.diagnostics();
      rows.push({ tau: c.tau, u: c.u, Re: m.reynolds, reCell: c.u / ((c.tau - 0.5) / 3),
        d, cells: L.cellCount, size: [L.nx, L.ny, L.nz],
        limited: dg.limited, limitedPct: 100 * dg.limited / L.cellCount,
        uMax: dg.uMax, rho: [dg.rhoMin, dg.rhoMax],
        wakeSpeed: X.exp.characterise(rec.speed, { horizon: a.horizon }),
        wakeTransverse: X.exp.characterise(rec.transverse, { horizon: a.horizon }),
        wallSpeedStd: X.exp.characterise(recW.speed, { horizon: a.horizon }).std });
      console.log('done tau=' + c.tau + ' u=' + c.u);
      await sim.backend.destroy();
    }
    return rows;
  }, { res: Number(arg('res', 32)), spin: 2500, every: 20, samples: 400, horizon: 14,
    configs: [
      { tau: 0.52, u: 0.08 },       // the shipped default
      { tau: 0.516, u: 0.14 },      // speed to the right only
      { tau: 0.506, u: 0.14 },      // and viscosity most of the way left
      { tau: 0.5015, u: 0.14 },     // both sliders at the stop -- the ask
    ] });
  console.log(JSON.stringify(out, null, 2));
}

// ------------------------------------------------------------------ hot
// THE SHIPPED SCENE AT THE SLIDER EXTREMES, scored regardless of clamping.
//
// The limiter matters for whether this flow is FAITHFUL TURBULENCE; it does not
// matter for whether one cell's history predicts another's. The target is the
// simulation's own field, so the soft-sensor question is well posed against
// whatever the solver produced -- clamped, modelled or resolved. What the clamp
// changes is what the ANSWER means, which is why the run reports how much of the
// target sat on the clamp and what the target series looked like.
if (MODE === 'hot') {
  const out = await call(async (scene, X, a) => {
    const PHYS = { collision: 'trt', trtPolicy: 'stability', smagorinsky: 0.16 };
    const sim = X.scenes.channelFlow({ resolution: a.res, tau: a.tau,
      inletVelocity: a.u, obstacle: 'cylinder', ...PHYS });
    await sim.build({ backend: 'webgpu' });
    const L = sim.lattice, m = sim.meta, d = m.obstacleCells;
    const cx = Math.round(a.res * 0.9), cy = (a.res >> 1) + 1;
    const probeCell = L.index(Math.min(L.nx - 2, cx + 2 * d), 1, L.nz >> 1);
    const hiddenCell = L.index(Math.min(L.nx - 2, cx + 5 * d), cy, L.nz >> 1);
    sim.advance(a.spin);
    const dg0 = await sim.diagnostics();
    const res0 = await X.exp.run(sim, { probeCell, hiddenCell,
      cfg: { every: a.every, warmup: a.warmup, train: a.train, score: a.score,
        horizon: a.horizon },
      log: (s) => console.log(s) });
    const dg = await sim.diagnostics();
    return { tau: a.tau, u: a.u, res: a.res, d, size: [L.nx, L.ny, L.nz],
      cells: L.cellCount, Re: m.reynolds, reCell: a.u / ((a.tau - 0.5) / 3),
      cells_used: { probeCell, hiddenCell },
      atSpinEnd: { limited: dg0.limited, limitedPct: 100 * dg0.limited / L.cellCount,
        uMax: dg0.uMax, rho: [dg0.rhoMin, dg0.rhoMax] },
      atEnd: { limited: dg.limited, limitedPct: 100 * dg.limited / L.cellCount,
        uMax: dg.uMax, rho: [dg.rhoMin, dg.rhoMax] },
      result: res0 };
  }, { res: Number(arg('res', 32)), tau: Number(arg('tau', 0.5015)),
    u: Number(arg('u', 0.14)), spin: Number(arg('spin', 3000)), every: 20,
    warmup: 250, train: 1200, score: 1200, horizon: Number(arg('horizon', 14)) });
  console.log(JSON.stringify(out, null, 2));
}

// ------------------------------------------------------------------ csweep
// CAN THIS ENGINE PRODUCE AN APERIODIC FLOW AT ALL at reachable settings?
//
// Raising both sliders to their stops does NOT do it: at Re_cell 280 the settled
// wake is still a limit cycle (autocorrelation at one period 0.984). Two reasons,
// and they compound. The lattice carries d = 6 cells across the obstacle, so the
// small scales that would make a wake chaotic cannot exist on it; and the
// Smagorinsky model exists precisely to DISSIPATE what cannot be resolved, so it
// damps the fluctuations that would take the flow to chaos. The effective
// Reynolds number of the RESOLVED field is far below the nominal one.
//
// That is a real tension rather than a defect: the mechanism that guarantees the
// run cannot crash is the same mechanism that keeps it smooth. This sweep
// measures the trade by weakening the model, with the limiter as the backstop --
// and clamping is acceptable here, per the owner's call.
if (MODE === 'csweep') {
  const out = await call(async (scene, X, a) => {
    const rows = [];
    for (const cs of a.csValues) {
      const sim = X.scenes.channelFlow({ resolution: a.res, tau: a.tau,
        inletVelocity: a.u, obstacle: 'cylinder',
        collision: 'trt', trtPolicy: 'stability', smagorinsky: cs });
      await sim.build({ backend: 'webgpu' });
      const L = sim.lattice, d = sim.meta.obstacleCells;
      const cx = Math.round(a.res * 0.9), cy = (a.res >> 1) + 1;
      const wake = L.index(Math.min(L.nx - 2, cx + 5 * d), cy, L.nz >> 1);
      sim.advance(a.spin);
      const rec = await X.exp.record(sim, wake, { every: a.every, samples: a.samples });
      const dg = await sim.diagnostics();
      const ch = X.exp.characterise(rec.speed, { horizon: a.horizon });
      rows.push({ cs, limited: dg.limited, limitedPct: 100 * dg.limited / L.cellCount,
        uMax: dg.uMax, rho: [dg.rhoMin, dg.rhoMax],
        finite: Number.isFinite(dg.uMax), d, cells: L.cellCount,
        acAtPeriod: ch.acAtPeriod, period: ch.period, std: ch.std, late: ch.late,
        persistNrmse: ch.persistNrmse, periodNrmse: ch.periodNrmse });
      console.log('done Cs=' + cs + '  ac@period=' + (ch.acAtPeriod || 0).toFixed(4)
        + '  limited=' + dg.limited);
      await sim.backend.destroy();
    }
    return rows;
  }, { res: Number(arg('res', 32)), tau: Number(arg('tau', 0.5015)),
    u: Number(arg('u', 0.14)), spin: 14000, every: 20, samples: 300, horizon: 14,
    csValues: [0.16, 0.08, 0.0] });
  console.log(JSON.stringify(out, null, 2));
}

await browser.close();
