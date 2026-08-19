/**
 * An IN-STREAM probe, and specifically one placed AFTER the flow matters. Every earlier
 * run used wall-mounted sensors -- non-intrusive, the realistic constraint. But industry
 * also runs intrusive probes in the flow itself (pitot tubes, hot-wires, immersion
 * thermocouples, in-line meters), and the accessible port is often DOWNSTREAM of the
 * process. So: can a downstream in-stream probe reconstruct the near-wake UPSTREAM of it,
 * where the vortices actually form?
 *
 * The physical bet is that a wake is advected, so a downstream probe is a FLOW HISTORIAN:
 * the lag window (4 x stride 6 ~ 3 diameters of convection) lets it read the state that
 * convected past it. The target is the near-wake column at x = cx + 2d (2 diameters behind
 * the cylinder, where the street forms); the same target is reconstructed from:
 *   wall-6         the optimal +/-2d straddle, 6 wall taps        (nf 97)  -- the baseline
 *   instream up    one probe UPSTREAM of the cylinder            (nf 17)  -- should be blind
 *   instream at    one probe on the wake centreline at the target(nf 17)
 *   instream +2d   one probe 2 diameters downstream of target    (nf 17)
 *   instream +4d   one probe 4 diameters downstream              (nf 17)
 *   instream +5d   one probe 5 diameters downstream (near outlet)(nf 17)
 *   instream +2,+4d two-probe downstream rake                    (nf 33)
 *   instream at+2d  probe at the target and one 2d downstream     (nf 33)
 * All in-stream probes read velocity+pressure (the best kind from sensor-kind.mjs).
 *
 * CAVEAT STATED UP FRONT: the probe here is a point READBACK, so it does not disturb the
 * flow. A real in-stream probe does (that is its whole engineering cost). This measures
 * whether the INFORMATION is available at that point, not the intrusion penalty -- which
 * is the right question for "does it make sense", with the intrusion a separate cost.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pw from '../test/node_modules/playwright-core/index.js';
const { chromium } = pw;
function findChrome() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(root).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
    const p = join(root, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p;
  }
  throw new Error('no chromium');
}
const browser = await chromium.launch({ executablePath: findChrome(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const pg = await browser.newPage();
pg.setDefaultTimeout(0);
pg.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await pg.goto((process.env.BASE_URL || 'http://127.0.0.1:8137/') + 'lattsim.html',
  { waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => window.__lsSim && window.__lsSim() && window.__lsSim().solver,
  null, { timeout: 120000 });

const out = await pg.evaluate(async () => {
  const { FieldReconstructor } = await import(new URL('./lib/probesense/sensor.js', location.href).href);
  const scenes = await import(new URL('./lib/lattsim/scenes.js', location.href).href);
  const PHYS = { collision: 'trt', trtPolicy: 'stability', smagorinsky: 0.16 };
  const Rr = 24;
  const sim = scenes.channelFlow({ resolution: Rr, tau: 0.52, inletVelocity: 0.08,
    obstacle: 'cylinder', inletMode: 'chaotic', inletAmplitude: 0.6, inletRate: 0.02, ...PHYS });
  await sim.build({ backend: 'webgpu' });
  const L = sim.lattice, d = sim.meta.obstacleCells;
  const cx = Math.round(Rr * 0.9), zc = L.nz >> 1, cy = (L.ny >> 1) + 1, yb = 1, yt = L.ny - 2;
  const clampx = (x) => Math.max(2, Math.min(L.nx - 2, x));
  const xt = clampx(cx + 2 * d);                 // near-wake target, 2d behind cylinder
  const velP = (v) => [v[1], v[2], v[3], v[0]];
  // target: near-wake column, y avoiding the centreline band so no in-stream probe coincides
  const ys = [4, 8, 16, 20].filter((y) => y < L.ny - 1);
  const targetCells = ys.map((y) => L.index(xt, y, zc));
  const K = ys.length;
  // in-stream points, all on the wake centreline
  const IS = (x) => L.index(clampx(x), cy, zc);
  // wall straddle around the target
  const wall = [];
  for (const o of [-2, 0, 2]) for (const w of [yb, yt]) wall.push(L.index(clampx(xt + o * d), w, zc));

  const configs = [
    { name: 'wall-6',          cells: wall },
    { name: 'instream up',     cells: [IS(cx - d)] },
    { name: 'instream at',     cells: [IS(xt)] },
    { name: 'instream +2d',    cells: [IS(xt + 2 * d)] },
    { name: 'instream +4d',    cells: [IS(xt + 4 * d)] },
    { name: 'instream +5d',    cells: [IS(xt + 5 * d)] },
    { name: 'instream +2,+4d', cells: [IS(xt + 2 * d), IS(xt + 4 * d)] },
    { name: 'instream at+2d',  cells: [IS(xt), IS(xt + 2 * d)] },
  ];
  // unique pool
  const poolMap = new Map(); const pool = [];
  const reg = (c) => { if (!poolMap.has(c)) { poolMap.set(c, pool.length); pool.push(c); } };
  configs.forEach((c) => c.cells.forEach(reg)); targetCells.forEach(reg);
  const cfg = { lag: 4, stride: 6, warmup: 200, ridge: 100, expand: false };
  configs.forEach((c) => { c.r = new FieldReconstructor({ ...cfg, nSignals: 4 * c.cells.length, nLocations: K }); c.est = []; });

  sim.advance(1500);
  const TRAIN = 1500, SCORE = 900;
  const truth = [];
  const spd = (v) => Math.hypot(v[1], v[2], v[3]);
  for (let i = 0; i < TRAIN + SCORE; i++) {
    sim.advance(10);
    const poolV = []; for (const c of pool) poolV.push(await sim.backend.probe('macro', c));
    const tV = targetCells.map((c) => spd(poolV[poolMap.get(c)]));
    configs.forEach((c) => {
      const sig = []; for (const cell of c.cells) sig.push(...velP(poolV[poolMap.get(cell)]));
      c.r.push(sig); const e = c.r.observe(tV);
      if (i >= TRAIN && e) c.est.push(e);
    });
    if (i >= TRAIN) truth.push(tV);
  }
  const dg = await sim.diagnostics();
  const nrmse = (E) => {
    const arr = [];
    for (let k = 0; k < K; k++) {
      const T = truth.map((r) => r[k]), P = E.map((r) => r[k]);
      const m = T.reduce((a, b) => a + b, 0) / T.length;
      const sd = Math.sqrt(T.reduce((a, b) => a + (b - m) ** 2, 0) / T.length);
      let se = 0; for (let i = 0; i < T.length; i++) se += (T[i] - P[i]) ** 2;
      arr.push(Math.sqrt(se / T.length) / (sd || 1e-9));
    }
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  };
  return { cells: L.cellCount, scored: truth.length, limited: dg.limited, xt,
    rows: configs.map((c) => ({ name: c.name, nSensors: c.cells.length, nf: c.r.nf, nrmse: nrmse(c.est) })) };
});
console.log(JSON.stringify(out, null, 1));
if (out && out.rows) {
  console.log('\nIn-stream vs wall -> NEAR-WAKE reconstruction at x=' + out.xt + ' (|u|, vel+P):');
  for (const r of out.rows) {
    const exp = 100 * (1 - Math.min(1, r.nrmse * r.nrmse));
    console.log('  ' + r.name.padEnd(16) + ' nRMSE ' + r.nrmse.toFixed(3) + '  (' + exp.toFixed(0) + '% explained)  ' + r.nSensors + ' sensor(s), nf ' + r.nf);
  }
}
await browser.close();
