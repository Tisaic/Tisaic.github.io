/**
 * Does the KIND of wall sensor matter, and does the best kind depend on what you are
 * soft-sensing? Every earlier run lumped velocity and density into one tap ([ux,uy,rho]).
 * A real wall instrument reads ONE thing: a pressure tap reads rho (p = rho cs^2), a
 * hot-film / shear gauge reads the near-wall streamwise velocity (a wall-shear proxy,
 * since du/dy ~ ux at the first fluid cell), a wall-normal probe reads uy. So this is a
 * matrix: sensor kind x reconstructed interior quantity, one simulation, fixed geometry
 * (the optimal +/-2d straddle on both walls), so only the signal kind and the target
 * quantity vary.
 *
 * Sensor kinds (signals each tap contributes):
 *   P (rho)      [rho]              -- a pressure tap
 *   shear (ux)   [ux]               -- near-wall streamwise ~ wall shear stress
 *   normal (uy)  [uy]               -- wall-normal velocity
 *   vel (u)      [ux, uy, uz]       -- a full velocity probe
 *   vel+P        [ux, uy, uz, rho]  -- everything a tap can read
 * Targets (interior wake quantity, 5 cells across the channel at x=46):
 *   |u|, ux, uy, rho
 *
 * Feature counts differ by kind (single-quantity taps share one nf; vel/vel+P are
 * larger), reported per cell so a win from more signal is not confused with a win from
 * better signal. nRMSE = rms(error)/std(truth); 1.0 = no better than the target's mean.
 *
 * MEASURED (res 24, cylinder, chaotic 0.6, +/-2d straddle both walls, 900 scored):
 *   kind          |u|     ux      uy     rho    nf
 *   P (rho)       0.520   0.519   0.612  0.334   25
 *   shear (ux)    0.500   0.499   0.609  0.516   25
 *   normal (uy)   0.940   0.940   0.746  0.897   25
 *   vel (u)       0.312   0.312   0.385  0.361   73
 *   vel+P         0.260   0.259   0.314  0.267   97
 *
 * YES, THE INSTRUMENT DEPENDS ON THE TARGET -- read the single-quantity taps, which
 * share nf=25 so the comparison is signal-for-signal. A PRESSURE tap reconstructs
 * interior PRESSURE best (rho 0.334) and is mediocre at velocity (0.52); a SHEAR tap
 * (near-wall ux) reconstructs interior VELOCITY best (ux 0.499, |u| 0.500) and is
 * mediocre at pressure (0.52). The off-diagonal penalty is real and asymmetric:
 * pressure beats shear at rho by 35% (0.334 vs 0.516), shear beats pressure at
 * velocity by a nose. Match the instrument to the quantity you actually want.
 *
 * A WALL-NORMAL VELOCITY TAP IS THE WEAKEST INSTRUMENT EVERYWHERE (0.75-0.94), and it
 * is a boundary condition, not bad luck: uy ~ 0 at a no-slip wall by construction, so
 * the near-wall normal velocity is starved of signal. It is the worst even for
 * reconstructing interior uy. Do not spend a sole sensor on wall-normal velocity.
 *
 * THE TRANSVERSE SHEDDING VELOCITY (uy) IS THE LEAST WALL-OBSERVABLE TARGET for every
 * instrument -- each row's uy column is its worst or near-worst (0.612/0.609/0.746/
 * 0.385/0.314). The von Karman transverse motion leaves the faintest wall signature;
 * it is the hardest interior quantity to soft-sense from the boundary.
 *
 * PRESSURE AND VELOCITY ARE COMPLEMENTARY, WHICH IS WHY vel+P WINS EVERY TARGET.
 * Adding pressure to a full velocity probe buys ~17% (vel 0.31 -> vel+P 0.26) even on
 * velocity targets, because a wall pressure tap has near-instantaneous global reach
 * (the flow is nearly incompressible) that a local velocity probe lacks -- the two are
 * non-redundant. A single pressure tap already reaches rho 0.334, nearly as well as a
 * full velocity probe reaches velocity (0.312) at a third of the features, so pressure
 * is the efficient choice when the target is pressure. Rule: measure velocity AND
 * pressure if you can; if limited to one instrument, match it to the target quantity,
 * and never rely on wall-normal velocity alone.
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
  const xn = clampx(cx + 4 * d);
  const X = (o) => clampx(xn + Math.round(o * d));
  // fixed geometry: +/-2d straddle, both walls, 6 taps
  const taps = [];
  for (const o of [-2, 0, 2]) for (const w of [yb, yt]) taps.push(L.index(X(o), w, zc));

  const KINDS = {
    'P (rho)':     (v) => [v[0]],
    'shear (ux)':  (v) => [v[1]],
    'normal (uy)': (v) => [v[2]],
    'vel (u)':     (v) => [v[1], v[2], v[3]],
    'vel+P':       (v) => [v[1], v[2], v[3], v[0]],
  };
  const TARGETS = {
    '|u|': (v) => Math.hypot(v[1], v[2], v[3]),
    'ux':  (v) => v[1],
    'uy':  (v) => v[2],
    'rho': (v) => v[0],
  };
  const ys = [4, 8, 12, 16, 20].filter((y) => y < L.ny - 1);
  const targetCells = ys.map((y) => L.index(xn, y, zc));
  const K = ys.length;
  const cfg = { lag: 4, stride: 6, warmup: 200, ridge: 100, expand: false };
  // one reconstructor per (kind, target)
  const grid = [];
  for (const [kn, kf] of Object.entries(KINDS)) {
    for (const [tn, tf] of Object.entries(TARGETS)) {
      const nSignals = kf([0, 0, 0, 0]).length * taps.length;
      grid.push({ kn, tn, kf, tf, est: [],
        r: new FieldReconstructor({ ...cfg, nSignals, nLocations: K }) });
    }
  }

  sim.advance(1500);
  const TRAIN = 1500, SCORE = 900;
  const truth = {}; for (const tn of Object.keys(TARGETS)) truth[tn] = [];
  for (let i = 0; i < TRAIN + SCORE; i++) {
    sim.advance(10);
    const tapV = []; for (const c of taps) tapV.push(await sim.backend.probe('macro', c));
    const intV = []; for (const c of targetCells) intV.push(await sim.backend.probe('macro', c));
    // per-target truth vectors
    const tvec = {};
    for (const [tn, tf] of Object.entries(TARGETS)) tvec[tn] = intV.map(tf);
    for (const g of grid) {
      const sig = []; for (const v of tapV) sig.push(...g.kf(v));
      g.r.push(sig); const e = g.r.observe(tvec[g.tn]);
      if (i >= TRAIN && e) g.est.push(e);
    }
    if (i >= TRAIN) for (const tn of Object.keys(TARGETS)) truth[tn].push(tvec[tn]);
  }
  const dg = await sim.diagnostics();
  const nrmse = (E, T) => {
    const arr = [];
    for (let k = 0; k < K; k++) {
      const Tk = T.map((r) => r[k]), Pk = E.map((r) => r[k]);
      const m = Tk.reduce((a, b) => a + b, 0) / Tk.length;
      const sd = Math.sqrt(Tk.reduce((a, b) => a + (b - m) ** 2, 0) / Tk.length);
      let se = 0; for (let i = 0; i < Tk.length; i++) se += (Tk[i] - Pk[i]) ** 2;
      arr.push(Math.sqrt(se / Tk.length) / (sd || 1e-9));
    }
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  };
  return { cells: L.cellCount, scored: Object.values(truth)[0].length, limited: dg.limited,
    kinds: Object.keys(KINDS), targets: Object.keys(TARGETS),
    rows: grid.map((g) => ({ kn: g.kn, tn: g.tn, nf: g.r.nf, nrmse: nrmse(g.est, truth[g.tn]) })) };
});
console.log(JSON.stringify(out, null, 1));
if (out && out.rows) {
  const cell = (kn, tn) => out.rows.find((r) => r.kn === kn && r.tn === tn);
  console.log('\nSensor kind x interior target -> nRMSE (fixed +/-2d straddle, both walls):');
  const hdr = out.targets.map((t) => t.padStart(7)).join(' ');
  console.log('  ' + 'kind'.padEnd(13) + hdr + '   nf');
  for (const kn of out.kinds) {
    const cells = out.targets.map((tn) => cell(kn, tn).nrmse.toFixed(3).padStart(7)).join(' ');
    const nf = cell(kn, out.targets[0]).nf;
    console.log('  ' + kn.padEnd(13) + cells + '   ' + nf);
  }
  // best kind per target
  console.log('\nBest kind per target:');
  for (const tn of out.targets) {
    const best = out.kinds.map((kn) => cell(kn, tn)).sort((a, b) => a.nrmse - b.nrmse)[0];
    console.log('  ' + tn.padEnd(5) + ' -> ' + best.kn + '  (' + best.nrmse.toFixed(3) + ')');
  }
}
await browser.close();
