/**
 * Does a LOCAL sensor reconstruct its slice better than a DISTANT one?
 *
 * The array-of-sensors architecture rests on this: reconstructing the whole field
 * from ONE sensor fails downstream because correlation decays with distance, but
 * an array where each sensor owns its LOCAL slice keeps every slice in the
 * high-correlation regime. This measures the claim on a channel with a chaotic
 * inlet, which decorrelates as the flow goes downstream.
 *
 *   sensor A  upstream wall        sensor B  downstream wall
 *   slice UP  a line across the channel near A
 *   slice DN  a line across the channel near B (5 diameters downstream)
 *
 * Compared, all reconstructing |u| at the slice cells, one shared reservoir each:
 *   A -> UP   local, the easy case
 *   A -> DN   DISTANT: one upstream sensor reaching the far slice
 *   B -> DN   LOCAL: a sensor that owns the far slice
 * If B->DN << A->DN, the array beats the single distant sensor and the
 * decomposition is justified.
 *
 * MEASURED (res 24, cylinder, chaotic inlet, 800 scored samples, flow clean --
 * 0 clamped, rho 0.96-1.10), per-location |u| nRMSE averaged across the slice:
 *   A -> UP  0.474   local, upstream
 *   A -> DN  0.787   DISTANT: upstream sensor reaching the far slice
 *   B -> DN  0.526   LOCAL: a sensor that owns the far slice
 * Locality helps and is CONSISTENT: a local sensor lands near 0.5 wherever it
 * sits, a distant one at 0.79. In explained variance that is 75% vs 38%, ~2x.
 * So the decomposition's premise holds -- each slice wants its own nearby sensor.
 * BUT even the local reconstruction is only moderate: one wall sensor captures a
 * few modes, a turbulent slice has more (and a wall sensor is local in x, not y).
 * The practical array for turbulent flow needs SEVERAL sensors per slice, roughly
 * the mode count -- the sparse-sensing result, measured rather than asserted.
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
  const { FieldReconstructor, QUANTITIES } =
    await import(new URL('./lib/probesense/sensor.js', location.href).href);
  const scenes = await import(new URL('./lib/lattsim/scenes.js', location.href).href);
  const PHYS = { collision: 'trt', trtPolicy: 'stability', smagorinsky: 0.16 };
  const R = 24;
  const sim = scenes.channelFlow({ resolution: R, tau: 0.52, inletVelocity: 0.08,
    obstacle: 'cylinder', inletMode: 'chaotic', inletAmplitude: 0.6, inletRate: 0.02, ...PHYS });
  await sim.build({ backend: 'webgpu' });
  const L = sim.lattice, d = sim.meta.obstacleCells;
  const cx = Math.round(R * 0.9), zc = L.nz >> 1;
  const xUp = Math.max(2, cx - 2 * d), xDn = Math.min(L.nx - 2, cx + 5 * d);
  const A = L.index(xUp, 1, zc);           // upstream wall sensor
  const B = L.index(xDn, 1, zc);           // downstream wall sensor
  // A slice = a line of cells across the channel (varying y) at a fixed x.
  const ys = [3, 7, 11, 15, 19].filter((y) => y < L.ny - 1);
  const sliceUp = ys.map((y) => L.index(xUp, y, zc));
  const sliceDn = ys.map((y) => L.index(xDn, y, zc));
  const K = ys.length;
  const cfg = { nSignals: 3, lag: 4, stride: 6, warmup: 200, ridge: 100 };
  const rAup = new FieldReconstructor({ ...cfg, nLocations: K });
  const rAdn = new FieldReconstructor({ ...cfg, nLocations: K });
  const rBdn = new FieldReconstructor({ ...cfg, nLocations: K });
  const sig = (v) => [v[1], v[2], v[0]];             // ux, uy, rho
  const spd = (v) => Math.hypot(v[1], v[2], v[3]);
  const nrmse = (K, truthArr, estArr) => {           // per-location nRMSE, averaged
    const out = [];
    for (let k = 0; k < K; k++) {
      const T = truthArr.map((r) => r[k]), E = estArr.map((r) => r[k]);
      const m = T.reduce((a, b) => a + b, 0) / T.length;
      const sd = Math.sqrt(T.reduce((a, b) => a + (b - m) ** 2, 0) / T.length);
      let se = 0; for (let i = 0; i < T.length; i++) se += (T[i] - E[i]) ** 2;
      out.push(Math.sqrt(se / T.length) / (sd || 1e-9));
    }
    return out.reduce((a, b) => a + b, 0) / out.length;
  };
  sim.advance(1500);
  const truthUp = [], truthDn = [], estAup = [], estAdn = [], estBdn = [];
  const TRAIN = 1200, SCORE = 800;
  for (let i = 0; i < TRAIN + SCORE; i++) {
    sim.advance(10);
    // Read every cell SEQUENTIALLY. The backend has one shared probe buffer, so
    // concurrent probes (Promise.all) collide on its mapAsync -- read one at a time.
    const va = await sim.backend.probe('macro', A);
    const vb = await sim.backend.probe('macro', B);
    const tUp = []; for (const c of sliceUp) tUp.push(spd(await sim.backend.probe('macro', c)));
    const tDn = []; for (const c of sliceDn) tDn.push(spd(await sim.backend.probe('macro', c)));
    rAup.push(sig(va)); const eAup = rAup.observe(tUp);
    rAdn.push(sig(va)); const eAdn = rAdn.observe(tDn);
    rBdn.push(sig(vb)); const eBdn = rBdn.observe(tDn);
    if (i >= TRAIN && eAup && eAdn && eBdn) {
      truthUp.push(tUp); truthDn.push(tDn); estAup.push(eAup); estAdn.push(eAdn); estBdn.push(eBdn);
    }
  }
  const dg = await sim.diagnostics();
  return { R, d, cells: L.cellCount, xUp, xDn, K, scored: truthUp.length,
    limited: dg.limited, rho: [dg.rhoMin, dg.rhoMax],
    A_up: nrmse(K, truthUp, estAup),      // local, upstream
    A_dn: nrmse(K, truthDn, estAdn),      // DISTANT: upstream sensor -> downstream slice
    B_dn: nrmse(K, truthDn, estBdn) };    // LOCAL: downstream sensor -> downstream slice
});
console.log(JSON.stringify(out, null, 1));
if (out && out.A_dn && out.B_dn) {
  console.log(`\nDownstream slice: distant sensor A->DN ${out.A_dn.toFixed(3)}  vs  local sensor B->DN ${out.B_dn.toFixed(3)}`);
  console.log(`Local is ${(out.A_dn / out.B_dn).toFixed(1)}x better  ${out.A_dn/out.B_dn > 1.5 ? '=> ARRAY WINS' : '=> marginal'}`);
}
await browser.close();
