/**
 * When does adding wall sensors stop gaining? The linear readout, pushed to the
 * plateau -- the saturation point is the wake's effective mode count.
 *
 * All sensors are wall-mounted (realistic). A pool of 16 taps spread along both
 * walls in x, ordered near-to-far from the target, drives one reconstructor per
 * cumulative count N = 1,2,4,6,8,10,12,16 -- one simulation, identical flow. The
 * target is the interior wake column 5 diameters downstream. Linear basis only, so
 * features scale linearly (nf = 3*N*4 + 1) and stay well below the sample count.
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
  const cx = Math.round(Rr * 0.9), zc = L.nz >> 1, yb = 1, yt = L.ny - 2;
  const clampx = (x) => Math.max(2, Math.min(L.nx - 2, x));
  const xn = clampx(cx + 5 * d);
  // Pool of 16 wall taps: 8 streamwise stations on both walls, ordered so each
  // added sensor spreads coverage (target station first, then alternate out).
  const stations = [cx + 5 * d, cx, cx + 8 * d, cx + 2 * d, cx + 10 * d, cx - 2 * d, cx + 4 * d, cx + 6 * d]
    .map(clampx);
  const pool = [];
  for (const x of stations) { pool.push(L.index(x, yb, zc)); pool.push(L.index(x, yt, zc)); }
  // cumulative-N configs, taking the first n pool entries
  const Ns = [1, 2, 4, 6, 8, 10, 12, 16];
  const ys = [4, 8, 12, 16, 20].filter((y) => y < L.ny - 1);
  const target = ys.map((y) => L.index(xn, y, zc));
  const K = ys.length;
  const cfg = { lag: 4, stride: 6, warmup: 200, ridge: 100, expand: false };
  const recon = Ns.map((n) => ({ n, idx: [...Array(n).keys()],
    r: new FieldReconstructor({ ...cfg, nSignals: 3 * n, nLocations: K }) }));

  sim.advance(1500);
  const TRAIN = 1500, SCORE = 900;
  const truth = [], est = recon.map(() => []);
  const spd = (v) => Math.hypot(v[1], v[2], v[3]);
  for (let i = 0; i < TRAIN + SCORE; i++) {
    sim.advance(10);
    const poolV = []; for (const c of pool) poolV.push(await sim.backend.probe('macro', c));
    const tV = []; for (const c of target) tV.push(spd(await sim.backend.probe('macro', c)));
    recon.forEach((o, j) => {
      const sig = [];
      for (const pi of o.idx) { const v = poolV[pi]; sig.push(v[1], v[2], v[0]); }
      o.r.push(sig); const e = o.r.observe(tV);
      if (i >= TRAIN && e) est[j].push(e);
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
    curve: recon.map((o, j) => ({ n: o.n, nf: o.r.nf, nrmse: nrmse(est[j]) })) };
});
console.log(JSON.stringify(out, null, 1));
if (out && out.curve) {
  console.log('\nWall sensors -> interior wake (linear readout):');
  let prev = null;
  for (const p of out.curve) {
    const exp = 100 * (1 - Math.min(1, p.nrmse * p.nrmse));
    const gain = prev == null ? '' : `  Δ ${(prev - p.nrmse).toFixed(3)}`;
    console.log(`  N=${String(p.n).padStart(2)}  nf=${String(p.nf).padStart(3)}  nRMSE ${p.nrmse.toFixed(3)}  (${exp.toFixed(0)}% explained)${gain}`);
    prev = p.nrmse;
  }
}
await browser.close();
