/**
 * How many WALL sensors reconstruct the interior wake? The industrial question.
 *
 * You cannot put a probe in the middle of a working flow -- it disturbs it and
 * often cannot be placed at all. Real instruments live on SURFACES: wall pressure
 * taps, wall shear/hot-film, sensors on the obstacle. So the honest problem is to
 * reconstruct the INTERIOR wake slice (which you want and cannot reach) from
 * WALL-MOUNTED sensors only, and to ask how many it takes.
 *
 * ONE simulation drives every configuration: each frame reads the whole wall pool
 * plus the target slice, and each reconstructor is fed only its own sensor subset,
 * so the counts are compared on identical flow in a single run.
 *
 * Wall pool (all no-slip wall cells, y = 1 bottom / ny-2 top, at increasing x):
 *   near/far x, both walls -- realistic tap positions.
 * Target: an interior column across the channel, 5 diameters downstream (the wake).
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
  const R = 24;
  const sim = scenes.channelFlow({ resolution: R, tau: 0.52, inletVelocity: 0.08,
    obstacle: 'cylinder', inletMode: 'chaotic', inletAmplitude: 0.6, inletRate: 0.02, ...PHYS });
  await sim.build({ backend: 'webgpu' });
  const L = sim.lattice, d = sim.meta.obstacleCells;
  const cx = Math.round(R * 0.9), zc = L.nz >> 1, yb = 1, yt = L.ny - 2;
  const xn = Math.min(L.nx - 2, cx + 5 * d);       // target x (the wake)
  // Wall-sensor POOL, all on walls, at increasing x. Index into this pool below.
  const poolX = [cx, cx + 2 * d, xn].map((x) => Math.min(L.nx - 2, x));
  const pool = [];
  for (const x of poolX) { pool.push(L.index(x, yb, zc)); pool.push(L.index(x, yt, zc)); }
  // pool order: [x0-bot, x0-top, x1-bot, x1-top, x2-bot, x2-top]
  // Target: interior column across the channel at xn (cells you cannot instrument).
  const ys = [4, 8, 12, 16, 20].filter((y) => y < L.ny - 1);
  const target = ys.map((y) => L.index(xn, y, zc));
  const K = ys.length;

  // Configurations by which pool indices each uses (realistic incremental taps):
  const configs = {
    'N1 (1 wall, at target x)': [4],                 // one bottom-wall tap at the wake x
    'N2 (both walls, target x)': [4, 5],
    'N4 (+ obstacle-x pair)': [2, 3, 4, 5],
    'N6 (+ upstream pair)': [0, 1, 2, 3, 4, 5],
  };
  const cfg = { lag: 4, stride: 6, warmup: 200, ridge: 100 };
  const recon = {};
  for (const [name, idx] of Object.entries(configs)) {
    recon[name] = { idx, r: new FieldReconstructor({ ...cfg, nSignals: 3 * idx.length, nLocations: K }) };
  }

  sim.advance(1500);
  const TRAIN = 1200, SCORE = 800;
  const truth = [], est = Object.fromEntries(Object.keys(configs).map((n) => [n, []]));
  const spd = (v) => Math.hypot(v[1], v[2], v[3]);
  for (let i = 0; i < TRAIN + SCORE; i++) {
    sim.advance(10);
    const poolV = []; for (const c of pool) poolV.push(await sim.backend.probe('macro', c));
    const tV = []; for (const c of target) tV.push(spd(await sim.backend.probe('macro', c)));
    for (const [name, o] of Object.entries(recon)) {
      const sig = [];
      for (const pi of o.idx) { const v = poolV[pi]; sig.push(v[1], v[2], v[0]); }  // ux,uy,rho per sensor
      o.r.push(sig); const e = o.r.observe(tV);
      if (i >= TRAIN && e) est[name].push(e);
    }
    if (i >= TRAIN) truth.push(tV);
  }
  const dg = await sim.diagnostics();
  const nrmse = (E) => {
    const out = [];
    for (let k = 0; k < K; k++) {
      const T = truth.map((r) => r[k]), P = E.map((r) => r[k]);
      const m = T.reduce((a, b) => a + b, 0) / T.length;
      const sd = Math.sqrt(T.reduce((a, b) => a + (b - m) ** 2, 0) / T.length);
      let se = 0; for (let i = 0; i < T.length; i++) se += (T[i] - P[i]) ** 2;
      out.push(Math.sqrt(se / T.length) / (sd || 1e-9));
    }
    return out.reduce((a, b) => a + b, 0) / out.length;
  };
  const result = {};
  for (const name of Object.keys(configs)) result[name] = nrmse(est[name]);
  return { R, d, cells: L.cellCount, scored: truth.length, limited: dg.limited,
    rho: [dg.rhoMin, dg.rhoMax], result };
});
console.log(JSON.stringify(out, null, 1));
if (out && out.result) {
  console.log('\nWall sensors -> interior wake reconstruction (nRMSE, and % variance explained):');
  for (const [name, v] of Object.entries(out.result)) {
    console.log(`  ${name.padEnd(28)} ${v.toFixed(3)}   (${(100*(1-Math.min(1,v*v))).toFixed(0)}% explained)`);
  }
}
await browser.close();
