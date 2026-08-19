/**
 * Do the wall-sensor placement rules hold at higher Reynolds number? Same six
 * 6-tap layouts as wall-layout.mjs, same interior wake target, but the flow is
 * pushed to a more turbulent wake: tau 0.51 (lower viscosity) and inlet 0.12
 * (Re ~ 216, Re_cell ~ 36, against the baseline Re ~ 72). TRT + the sub-grid model
 * hold this; the run reports `limited` and the density range so a corrupted flow
 * cannot masquerade as a placement finding.
 *
 * The question is whether the baseline conclusions survive more turbulence:
 *   - does co-location still dominate (or does a more energetic wake let the lag
 *     window finally make upstream taps useful)?
 *   - does downstream still beat upstream?
 *   - does one wall still nearly tie two?
 * A more turbulent wake has more fine structure that surface sensors cannot see, so
 * the absolute nRMSE floor should RISE; the interesting result is whether the
 * ORDERING changes.
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
  const sim = scenes.channelFlow({ resolution: Rr, tau: 0.51, inletVelocity: 0.12,
    obstacle: 'cylinder', inletMode: 'chaotic', inletAmplitude: 0.6, inletRate: 0.02, ...PHYS });
  await sim.build({ backend: 'webgpu' });
  const L = sim.lattice, d = sim.meta.obstacleCells;
  const cx = Math.round(Rr * 0.9), zc = L.nz >> 1, yb = 1, yt = L.ny - 2;
  const clampx = (x) => Math.max(2, Math.min(L.nx - 2, x));
  const xn = clampx(cx + 4 * d);
  const X = (o) => clampx(xn + Math.round(o * d));
  const layouts = {
    'at-slice':   { offs: [-1, 0, 1],  walls: [yb, yt] },
    'upstream':   { offs: [-4, -3, -2], walls: [yb, yt] },
    'downstream': { offs: [1, 2, 3],   walls: [yb, yt] },
    'straddle':   { offs: [-3, 0, 3],  walls: [yb, yt] },
    'spread':     { offs: [-4, -1, 3], walls: [yb, yt] },
    'one-wall':   { offs: [-4, -2, -1, 0, 1, 3], walls: [yb] },
  };
  const poolMap = new Map(); const pool = [];
  const cellOf = (x, y) => { const c = L.index(x, y, zc);
    if (!poolMap.has(c)) { poolMap.set(c, pool.length); pool.push(c); } return c; };
  const configs = Object.entries(layouts).map(([name, cf]) => {
    const cells = [];
    for (const o of cf.offs) for (const w of cf.walls) cells.push(cellOf(X(o), w));
    return { name, cells, nTaps: cells.length };
  });
  const ys = [4, 8, 12, 16, 20].filter((y) => y < L.ny - 1);
  const target = ys.map((y) => L.index(xn, y, zc));
  const K = ys.length;
  const cfg = { lag: 4, stride: 6, warmup: 200, ridge: 100, expand: false };
  configs.forEach((c) => { c.r = new FieldReconstructor({ ...cfg, nSignals: 3 * c.nTaps, nLocations: K }); c.est = []; });

  sim.advance(1500);
  const TRAIN = 1500, SCORE = 900;
  const truth = [];
  const spd = (v) => Math.hypot(v[1], v[2], v[3]);
  for (let i = 0; i < TRAIN + SCORE; i++) {
    sim.advance(10);
    const poolV = []; for (const c of pool) poolV.push(await sim.backend.probe('macro', c));
    const tV = []; for (const c of target) tV.push(spd(await sim.backend.probe('macro', c)));
    configs.forEach((c) => {
      const sig = [];
      for (const cell of c.cells) { const v = poolV[poolMap.get(cell)]; sig.push(v[1], v[2], v[0]); }
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
  return { cells: L.cellCount, scored: truth.length, limited: dg.limited,
    uMax: dg.uMax, rhoMin: dg.rhoMin, rhoMax: dg.rhoMax, stable: dg.stable, xn,
    rows: configs.map((c) => ({ name: c.name, nTaps: c.nTaps, nf: c.r.nf, nrmse: nrmse(c.est) })) };
});
console.log(JSON.stringify(out, null, 1));
if (out && out.rows) {
  console.log('\nHIGHER-Re wall-sensor layout -> interior wake at x=' + out.xn + ' (6 taps, linear, nf=73):');
  const sorted = [...out.rows].sort((a, b) => a.nrmse - b.nrmse);
  for (const r of sorted) {
    const exp = 100 * (1 - Math.min(1, r.nrmse * r.nrmse));
    console.log(`  ${r.name.padEnd(11)} nRMSE ${r.nrmse.toFixed(3)}  (${exp.toFixed(0)}% explained)`);
  }
}
await browser.close();
