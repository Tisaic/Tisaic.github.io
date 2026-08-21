/**
 * Where do you put a fixed budget of wall sensors? Six taps -- the saturation
 * count from wall-saturation.mjs -- laid out six different ways, all reconstructing
 * the SAME interior wake column, all from one simulation with an identical feature
 * count (nf = 73), so the only variable is geometry.
 *
 * The wake convects downstream and the linear readout carries a lag window (4 x
 * stride 6 ~ 3 diameters of convection time), so this is NOT a symmetric question:
 * an UPSTREAM wall tap sees a disturbance that will ARRIVE at the target, a
 * DOWNSTREAM tap sees what already passed it, an AT-SLICE tap sees it now. The
 * target sits mid-wake (cx + 4d) so upstream and downstream both have real room.
 *
 * Layouts, offsets from the target x in diameters (each is 6 taps):
 *   at-slice    {-1, 0, +1}   x both walls   -- clustered on the slice
 *   upstream    {-4,-3,-2}    x both walls   -- toward the cylinder
 *   downstream  {+1,+2,+3}    x both walls   -- toward the outlet
 *   straddle    {-3, 0,+3}    x both walls   -- bracketing the target
 *   spread      {-4,-1,+3}    x both walls   -- wide baseline
 *   one-wall    {-4,-2,-1,0,+1,+3} x one wall -- can only instrument one wall
 *
 * MEASURED (res 24, cylinder, chaotic 0.6, target x=46, 6 taps, nf=73, 900 scored):
 *   straddle    nRMSE 0.280  (92% var)   {-3,0,+3} both walls
 *   one-wall    nRMSE 0.297  (91%)       6 stations, ONE wall
 *   at-slice    nRMSE 0.311  (90%)       {-1,0,+1} both walls
 *   spread      nRMSE 0.447  (80%)       {-4,-1,+3} both walls
 *   downstream  nRMSE 0.537  (71%)       {+1,+2,+3} both walls
 *   upstream    nRMSE 0.672  (55%)       {-4,-3,-2} both walls
 *
 * CO-LOCATION WINS, THE LAG WINDOW DOES NOT RESCUE UPSTREAM. The top three layouts
 * all keep a tap AT the target's x; the two worst abandon it, and UPSTREAM is worst
 * by far. This overturns the leading-indicator hypothesis: the convective lag window
 * spans ~2.8 diameters, so an upstream tap's future-arriving signal IS inside the
 * window -- but near the cylinder (x=22-34) the wall carries the cylinder's own shear
 * boundary layer, not a clean advected copy of what will reach the target, and
 * turbulent diffusion decorrelates it over that distance faster than the lag can
 * exploit. Mutual information with the interior target falls off with streamwise
 * distance faster than time-delay embedding recovers it.
 *
 * DOWNSTREAM BEATS UPSTREAM (0.537 vs 0.672): a wake is an advected structure, so a
 * tap that already saw it pass retains more of its memory than one sitting where it
 * has not formed yet.
 *
 * STRADDLE BEATS AT-SLICE (0.280 vs 0.311): a modest baseline AROUND the target adds
 * the shedding phase -- the +3d tap lags the -3d tap by the convection time -- which a
 * tight ±1d cluster of near-redundant taps cannot supply. But a baseline that ABANDONS
 * the target x (pure spread, 0.447) throws that co-location away and loses. The rule is
 * bracket the slice, do not desert it.
 *
 * ONE WALL IS NEARLY AS GOOD AS TWO (0.297 vs 0.280), and beats the two-wall at-slice.
 * Spending the same 6-tap budget on streamwise stations along ONE wall recovers the
 * shedding phase (it is a traveling wave; one wall samples its full phase), so the
 * top/bottom antisymmetry is not required. Industrially decisive: instrumenting one
 * wall, which is often all you can do, costs almost nothing here.
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
  const cx = Math.round(Rr * 0.9), zc = L.nz >> 1, yb = 1, yt = L.ny - 2;
  const clampx = (x) => Math.max(2, Math.min(L.nx - 2, x));
  const xn = clampx(cx + 4 * d);           // target: mid-wake, room both sides
  const X = (o) => clampx(xn + Math.round(o * d));

  // layout -> list of [x, wall] taps
  const layouts = {
    'at-slice':   { offs: [-1, 0, 1],  walls: [yb, yt] },
    'upstream':   { offs: [-4, -3, -2], walls: [yb, yt] },
    'downstream': { offs: [1, 2, 3],   walls: [yb, yt] },
    'straddle':   { offs: [-3, 0, 3],  walls: [yb, yt] },
    'spread':     { offs: [-4, -1, 3], walls: [yb, yt] },
    'one-wall':   { offs: [-4, -2, -1, 0, 1, 3], walls: [yb] },
  };
  // pool of unique cells, and each layout's tap-cell list
  const poolMap = new Map(); const pool = [];
  const cellOf = (x, y) => { const c = L.index(x, y, zc);
    if (!poolMap.has(c)) { poolMap.set(c, pool.length); pool.push(c); } return c; };
  const configs = Object.entries(layouts).map(([name, cf]) => {
    const cells = [];
    for (const o of cf.offs) for (const w of cf.walls) cells.push(cellOf(X(o), w));
    return { name, cells, nTaps: cells.length };
  });
  // sanity: distinct x-stations actually resolved (clamping can collapse)
  const distinctX = {};
  for (const [name, cf] of Object.entries(layouts)) distinctX[name] = new Set(cf.offs.map((o) => X(o))).size;

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
  return { cells: L.cellCount, scored: truth.length, limited: dg.limited, xn, distinctX,
    rows: configs.map((c) => ({ name: c.name, nTaps: c.nTaps, nf: c.r.nf, nrmse: nrmse(c.est) })) };
});
console.log(JSON.stringify(out, null, 1));
if (out && out.rows) {
  console.log('\nWall-sensor layout -> interior wake at x=' + out.xn + ' (6 taps, linear, nf=73):');
  const sorted = [...out.rows].sort((a, b) => a.nrmse - b.nrmse);
  for (const r of sorted) {
    const exp = 100 * (1 - Math.min(1, r.nrmse * r.nrmse));
    console.log(`  ${r.name.padEnd(11)} nRMSE ${r.nrmse.toFixed(3)}  (${exp.toFixed(0)}% explained)  distinctX ${out.distinctX[r.name]}`);
  }
}
await browser.close();
