/**
 * Does the straddle bracket have an optimum width? wall-layout.mjs found that a
 * straddle -- one tap on the slice, two bracketing it -- beats a tight cluster, by
 * capturing the shedding phase via the convection lag between the brackets. So how
 * wide should the bracket be? Fixed 6-tap budget, one simulation, identical feature
 * count (nf = 73), target mid-wake at x=46; only the bracket half-width changes.
 *
 * THE DOMAIN CAPS THE SWEEP, and that is part of the answer. The channel is 3n long
 * (~7.5 diameters total) with the cylinder near the inlet, so the wake lives in only
 * ~5-6 diameters. A bracket wider than ~4d runs the upstream tap into the cylinder's
 * own boundary layer (worst location, per wall-layout.mjs) or off the front of it
 * into undisturbed inlet flow, and the downstream tap into the outlet clamp. So the
 * optimum is bounded by geometry, not chosen freely.
 *
 *   tight (+/-1d)  {-1, 0, +1}   both walls
 *   +/-2d          {-2, 0, +2}   both walls
 *   +/-3d          {-3, 0, +3}   both walls
 *   +/-4d          {-4, 0, +4}   both walls   -- -4d sits at the cylinder, +4d at outlet
 *   dn-bias        { 0,+2, +4}   both walls   -- biased downstream, where info is richer
 *
 * MEASURED (res 24, cylinder, chaotic 0.6, target x=46, 6 taps, nf=73, 900 scored):
 *   tight +/-1d  nRMSE 0.311  (90% var)
 *   +/-2d        nRMSE 0.277  (92%)   <- symmetric optimum
 *   +/-3d        nRMSE 0.280  (92%)
 *   +/-4d        nRMSE 0.286  (92%)
 *   dn-bias      nRMSE 0.273  (93%)   <- best overall
 *
 * A GENTLE BOWL WITH A DOWNSTREAM-BIASED OPTIMUM. Only the tight +/-1d cluster is
 * clearly bad (three near-redundant taps carry no convective phase). From +/-2d out
 * the curve is a shallow plateau that turns over: +/-2d is the symmetric best and it
 * degrades as the bracket widens toward the cylinder (+/-4d puts the upstream tap in
 * the cylinder boundary layer). The whole plateau spans only ~5% (0.273-0.286), so
 * the practical rule is loose: any 2-4 diameter bracket is fine, tight is the only
 * mistake. The one real structure is the ASYMMETRY -- the downstream-biased {0,+2,+4}
 * edges every symmetric straddle, because a wake is advected and the downstream side
 * carries more of it (the same reason downstream beat upstream in wall-layout.mjs).
 * So: bracket the slice by ~2 diameters, and if you must choose a side, choose
 * downstream.
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
  const xn = clampx(cx + 4 * d);
  const X = (o) => clampx(xn + Math.round(o * d));
  const widths = {
    'tight +/-1d': [-1, 0, 1],
    '+/-2d':       [-2, 0, 2],
    '+/-3d':       [-3, 0, 3],
    '+/-4d':       [-4, 0, 4],
    'dn-bias':     [0, 2, 4],
  };
  const poolMap = new Map(); const pool = [];
  const cellOf = (x, y) => { const c = L.index(x, y, zc);
    if (!poolMap.has(c)) { poolMap.set(c, pool.length); pool.push(c); } return c; };
  const configs = Object.entries(widths).map(([name, offs]) => {
    const cells = [];
    for (const o of offs) for (const w of [yb, yt]) cells.push(cellOf(X(o), w));
    return { name, cells, nTaps: cells.length, distinctX: new Set(offs.map((o) => X(o))).size };
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
  return { cells: L.cellCount, scored: truth.length, limited: dg.limited, xn,
    rows: configs.map((c) => ({ name: c.name, nf: c.r.nf, distinctX: c.distinctX, nrmse: nrmse(c.est) })) };
});
console.log(JSON.stringify(out, null, 1));
if (out && out.rows) {
  console.log('\nStraddle bracket width -> interior wake at x=' + out.xn + ' (6 taps, linear, nf=73):');
  for (const r of out.rows) {
    const exp = 100 * (1 - Math.min(1, r.nrmse * r.nrmse));
    console.log(`  ${r.name.padEnd(12)} nRMSE ${r.nrmse.toFixed(3)}  (${exp.toFixed(0)}% explained)  distinctX ${r.distinctX}`);
  }
}
await browser.close();
