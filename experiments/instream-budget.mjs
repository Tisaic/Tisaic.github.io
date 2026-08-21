/**
 * Equal budget: 6 in-stream probes vs 6 wall taps, same target, same feature count
 * (nf 97). instream.mjs found one interior probe loses to a six-tap wall array, but
 * that was 1 vs 6 -- not a fair fight. This matches the budget and the spatial spread,
 * so the only question left is whether being IN the flow beats being ON the wall, and
 * what an in-stream array needs: transverse spread, streamwise spread, or both.
 *
 * All four configs are 6 sensors of velocity+pressure (nSignals 24, nf 97), all
 * reconstructing the same near-wake column at x = cx + 2d:
 *   wall-6        the optimal +/-2d straddle, both walls           -- baseline
 *   instream-shear the SAME 3 streamwise stations, lifted off the
 *                  walls into the wake shear layers (y ~ +/-quarter) -- wall array, in-flow
 *   instream-rake  a transverse rake AT the target x, spanning y    -- transverse only
 *   instream-line  6 probes along the wake centreline in x          -- streamwise only
 *
 * CAVEAT (as in instream.mjs): the probe is a non-intrusive point readback, so this is
 * the INFORMATION available at those points, not the intrusion cost a real probe pays.
 *
 * MEASURED (res 24, cylinder, chaotic 0.6, near-wake target x=34, |u|, 900 scored):
 *   instream-rake    nRMSE 0.188  (96% var)   transverse rake at the target station
 *   instream-shear   nRMSE 0.248  (94%)       straddle geometry, lifted into shear layers
 *   wall-6           nRMSE 0.266  (93%)       the wall straddle baseline
 *   instream-line    nRMSE 0.357  (87%)       centreline, streamwise only
 *
 * AT EQUAL BUDGET, IN-STREAM WINS -- SO THE EARLIER "WALLS WIN" WAS THE BUDGET GAP.
 * The same straddle geometry lifted off the walls into the shear layers beats the wall
 * array (0.248 vs 0.266), because no-slip damps the signal at the wall and the wake's
 * energy lives in the shear layers. But the margin is small, ~7%: the boundary carries
 * the coherent wake signature nearly as well as the interior does.
 *
 * THE BIG LEVER IS NOT IN-FLOW-VS-WALL, IT IS MATCHING THE ARRAY GEOMETRY TO THE TARGET
 * GEOMETRY. The transverse RAKE at the target station wins outright (0.188, 96%), beating
 * every straddle. The target is a transverse COLUMN, and a transverse rake at the same x
 * is spatially aligned with it -- maximal transverse coverage, zero streamwise
 * displacement. The straddle spent two of its three stations at +/-2d away in x, spread
 * the transverse target does not need; the rake spends all six spanning the column. So
 * transverse alignment > in-flow bonus > streamwise spread, and the centreline LINE
 * (streamwise only, along the quiet velocity-deficit centreline) is worst even at 6
 * sensors -- streamwise spread alone cannot reconstruct a transverse target. This is the
 * same co-location lesson as before, refined: co-locate AND align the array's shape to
 * the target's shape.
 *
 * THE HONEST ENGINEERING TRADE: the arrangement that wins on INFORMATION is the one that
 * would disturb the flow MOST -- a transverse rake spanning the channel two diameters
 * behind the cylinder is a physical obstruction right across the wake it is measuring.
 * So the interior's ~30% reconstruction edge over the wall array (0.188 vs 0.266) is
 * bought with the worst intrusion, while the wall array gives up that 30% to touch
 * nothing. That is the real choice in-stream sensing poses, now quantified: richer,
 * better-aligned information in the flow, against a non-intrusive boundary array that is
 * only modestly behind. For a distributed interior target you want the flow; for a
 * hands-off installation the walls cost only ~30%.
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
await pg.goto((process.env.BASE_URL || 'http://127.0.0.1:8137/') + 'flowsim.html',
  { waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => window.__fsSim && window.__fsSim() && window.__fsSim().solver,
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
  const xt = clampx(cx + 2 * d);
  const velP = (v) => [v[1], v[2], v[3], v[0]];
  const C = (x, y) => L.index(clampx(x), y, zc);
  const ys = [4, 8, 16, 20].filter((y) => y < L.ny - 1);
  const targetCells = ys.map((y) => L.index(xt, y, zc));
  const K = ys.length;
  const xs = [xt - 2 * d, xt, xt + 2 * d];          // the straddle stations
  const shearY = [Math.round(L.ny * 0.375), Math.round(L.ny * 0.625)];  // wake shear layers ~ y +/- quarter

  const configs = [
    { name: 'wall-6',        cells: xs.flatMap((x) => [C(x, yb), C(x, yt)]) },
    { name: 'instream-shear', cells: xs.flatMap((x) => shearY.map((y) => C(x, y))) },
    { name: 'instream-rake',  cells: [3, 6, 10, 13, 18, 21].map((y) => C(xt, y)) },
    { name: 'instream-line',  cells: [xt - 2 * d, xt - d, xt, xt + d, xt + 2 * d, xt + 4 * d].map((x) => C(x, cy)) },
  ];
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
  return { cells: L.cellCount, scored: truth.length, limited: dg.limited, xt, shearY,
    rows: configs.map((c) => ({ name: c.name, nSensors: c.cells.length, nf: c.r.nf, nrmse: nrmse(c.est) })) };
});
console.log(JSON.stringify(out, null, 1));
if (out && out.rows) {
  console.log('\nEqual-budget (6 sensors, nf 97) -> near-wake at x=' + out.xt + ' (|u|):');
  const sorted = [...out.rows].sort((a, b) => a.nrmse - b.nrmse);
  for (const r of sorted) {
    const exp = 100 * (1 - Math.min(1, r.nrmse * r.nrmse));
    console.log('  ' + r.name.padEnd(16) + ' nRMSE ' + r.nrmse.toFixed(3) + '  (' + exp.toFixed(0) + '% explained)');
  }
}
await browser.close();
