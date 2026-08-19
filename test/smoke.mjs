// Smoke test: drives the real page in a mobile-emulated Chromium, exercises
// the console + docs viewer, asserts behavior, and writes screenshots for
// visual review. Exits non-zero if any check fails.
//
// Run via ./test/run.sh (starts a local server, ensures deps, tears down).
import { chromium } from 'playwright-core';
import { existsSync, readdirSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'screenshots');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8137/';

function findChrome() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of readdirSync(root).filter(x => x.startsWith('chromium-')).sort().reverse()) {
      const p = join(root, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  } catch { /* ignore */ }
  for (const c of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (existsSync(c)) return c;
  }
  throw new Error('No Chromium found. Set CHROME_BIN to a Chrome/Chromium binary.');
}

// Two tiers, set by test/run.sh. QUICK covers every cheap assertion plus the
// analytic physics; FULL adds the long-horizon scenarios -- the two-mode
// anti-slosh convergence and the LattSim scene sweep, resolution ladder and
// stir/settle checks -- which between them drive several thousand solver steps
// through a software GPU and a few minutes of control simulation.
const FULL = process.env.SUITE === 'full';

let failed = 0;
// Section timing, so "the suite is slow" can be answered with a number instead
// of a guess. Printed at the end.
const timings = [];
let _t0 = Date.now(), _section = 'startup';
function section(name) {
  timings.push([_section, Date.now() - _t0]);
  _section = name; _t0 = Date.now();
}
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}

/**
 * THE CONSOLE MUST BE CLOSEABLE ON EVERY PAGE THAT EMBEDS IT, and this has to be
 * asserted per page rather than once, because the failure came from the HOST
 * page's stylesheet rather than from the console.
 *
 * ngrc.html and lattsim.html both style their own touch controls with a global
 * `button { flex:1; min-width:110px }`. console-boot's rules are more specific
 * and won every property they named -- but they did not name min-width, so the
 * four header buttons were forced to 110px each, 440px of them on a 412px phone,
 * and `Close ✕` was pushed off the right edge. Opening the console on those
 * pages left no way to shut it without reloading. index.html has no such rule,
 * so the one page the suite did check was the one page that worked.
 *
 * Asserting geometry, not presence: the button existed and was "visible" the
 * whole time. It was simply not on the screen.
 */
async function checkConsoleUsable(pg, label) {
  if (!(await pg.isVisible('#dbg-list'))) {
    await pg.click('#dbg-launch');
    await pg.waitForTimeout(250);
  }
  const geom = await pg.evaluate(() => {
    const c = document.getElementById('dbg-close').getBoundingClientRect();
    const l = document.getElementById('dbg-launch').getBoundingClientRect();
    return {
      left: Math.round(c.left), right: Math.round(c.right), width: Math.round(c.width),
      vw: window.innerWidth, launch: [Math.round(l.width), Math.round(l.height)],
    };
  });
  check(`${label}: the console Close button is on screen`,
    geom.left >= 0 && geom.right <= geom.vw + 1 && geom.width > 0, JSON.stringify(geom));
  check(`${label}: the console launcher keeps its own 46px size`,
    Math.abs(geom.launch[0] - 46) <= 2 && Math.abs(geom.launch[1] - 46) <= 2, JSON.stringify(geom));
  await pg.click('#dbg-close');
  await pg.waitForTimeout(200);
  check(`${label}: clicking Close actually closes the console`, !(await pg.isVisible('#dbg-list')));
}

mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({
  executablePath: findChrome(),
  // SwiftShader so the WebGL (three.js) NGRC demo renders headless.
  // --enable-unsafe-webgpu additionally exposes a SwiftShader WebGPU adapter,
  // which is what lets the LattSim tab exercise its PRODUCTION WGSL backend here
  // rather than only its CPU reference. Without it navigator.gpu exists on a
  // secure origin but requestAdapter() returns null. It is software and slow --
  // fine for correctness, useless for throughput.
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
});
const ctx = await browser.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));

console.log(`\nSmoke test → ${BASE}\n`);

section('index page');
// ---- load ----
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.screenshot({ path: join(SHOTS, '01-home.png') });
check('page loads with no uncaught errors', pageErrors.length === 0, pageErrors.join(' | '));

const build = await page.evaluate(() => window.__BUILD);
check('build version is stamped (> 0)', build && build.version > 0, JSON.stringify(build));

// ---- console capture ----
check('debug launcher present', await page.$('#dbg-launch') !== null);
await page.evaluate(() => { console.log('smoke log'); console.warn('smoke warn'); console.error('smoke error'); });
const buf = await page.evaluate(() => window.__dbg.buffer().map(e => e.type));
check('console captured log/warn/error', buf.includes('log') && buf.includes('warn') && buf.includes('error'), buf.join(','));

await page.click('#dbg-launch');
await page.waitForTimeout(300);
check('console panel opens', await page.isVisible('#dbg-list'));
const buildText = (await page.textContent('#dbg-build')) || '';
check('version status reads "latest" vs local server', /latest/.test(buildText), buildText);
await page.screenshot({ path: join(SHOTS, '02-console.png') });

// ---- eval box ----
await page.fill('#dbg-input', '1 + 2');
await page.click('#dbg-run');
await page.waitForTimeout(200);
const evalOk = await page.evaluate(() => window.__dbg.buffer().some(e => e.text.trim() === '3'));
check('eval box evaluates JS (1 + 2 → 3)', evalOk);

// ---- docs viewer ----
await checkConsoleUsable(page, 'index');
check('docs launcher present', await page.$('#doc-all') !== null);
await page.click('#doc-all');
await page.waitForTimeout(700);
check('marked library loaded', await page.evaluate(() => !!(window.marked && window.marked.parse)));
const tag = await page.textContent('#doc-head .doc-tag').catch(() => '');
check('opens CLAUDE.md with CLAUDE tag', tag === 'CLAUDE', tag);
const h1 = await page.textContent('#doc-body h1').catch(() => '');
check('CLAUDE.md renders markdown (h1 element)', /CLAUDE/.test(h1 || ''), h1);
const groups = await page.$$eval('#doc-bar optgroup', gs => gs.map(g => g.label));
check('file list groups CLAUDE context + Docs',
  groups.some(g => /CLAUDE/.test(g)) && groups.some(g => /Docs/.test(g)), groups.join(' | '));
await page.screenshot({ path: join(SHOTS, '03-docs.png') });

// ---- NGRC playground (ngrc.html): three.js + Plotly + the ported library ----
// THE WHOLE NGRC PAGE IS FULL-TIER.
//
// The quick tier exists to be run on every edit, and what is being edited is
// LattSim. Loading ngrc.html costs most of quick's wall clock, and its
// soft-sensor and finger-trace checks wait on warm-up timers that get flaky
// under load -- so a LattSim edit was being reported on by checks that have
// nothing to do with it and can fail for reasons that are not the edit's fault.
// They still run on --full, where they belong.
const demoBase = BASE.replace(/index\.html$/, '') + 'ngrc.html';
if (FULL) {
section('ngrc load');
const demo = await ctx.newPage();
const demoErrors = [];
demo.on('pageerror', e => demoErrors.push(String(e)));
demo.on('console', m => { if (m.type() === 'error') demoErrors.push('console.error: ' + m.text()); });
await demo.goto(demoBase, { waitUntil: 'networkidle' });
await demo.waitForTimeout(2500);
check('ngrc.html loads with no errors', demoErrors.length === 0, demoErrors.join(' | '));
const three = await demo.evaluate(() => !!(window.THREE || document.querySelector('#lz-stage canvas')));
check('ngrc: WebGL/three canvas present', three);
await checkConsoleUsable(demo, 'ngrc');
const nSamp = parseInt(await demo.textContent('#lz-n')) || 0;
check('ngrc: Lorenz model runs (samples > 0)', nSamp > 0, String(nSamp));
check('ngrc: model warms up', (await demo.textContent('#lz-warm')) === 'yes');
// training is manual now: idle until Start training, then wait out the window
check('ngrc: training idle until started', (await demo.evaluate(() => window.__lzDbg().trained)) === 0);
await demo.click('#lz-train');
await demo.waitForFunction(() => window.__lzDbg().trained >= 1500, null, { timeout: 30000 });
await demo.waitForSelector('#lz-dream:not([disabled])', { timeout: 30000 });
check('ngrc: ESN 1-step row populated', Number.isFinite(parseFloat(await demo.textContent('#lz-esn'))), await demo.textContent('#lz-esn'));
check('ngrc: MLP 1-step row populated', Number.isFinite(parseFloat(await demo.textContent('#lz-mlp'))), await demo.textContent('#lz-mlp'));
await demo.click('#lz-dream');
await demo.waitForTimeout(500);
check('ngrc: dream (free-run) toggles', /dreaming/.test(await demo.textContent('#lz-mode')));
await demo.waitForTimeout(1500);
check('ngrc: dream check row lists all four models', /NGRC.*ESN.*MLP.*linear/.test(await demo.textContent('#lz-dstat')), await demo.textContent('#lz-dstat'));
await demo.screenshot({ path: join(SHOTS, '04-ngrc.png') });
{
  // PER-SYSTEM RIDGE. The double pendulum CONSERVES ENERGY, so nothing contracts
  // a roll-out's error back onto an attractor the way Lorenz's dissipation does,
  // and the ridge that is harmless there (flat over 5 decades, measured) let the
  // pendulum's roll-out pump energy and saturate its clamps within ~10 steps.
  // Measured in this app, 12-run batches: NGRC 0.24 -> 0.64 Λ. Pinning the values
  // because the failure mode is silent — the 1-step fit stays excellent either
  // way (nRMSE ~6e-4), so nothing else in the suite would notice a revert.
  const ivLor = await demo.evaluate(() => window.__lzDbg().iv);
  await demo.selectOption('#lz-sys', 'dpend');
  await demo.waitForTimeout(400);
  const dp = await demo.evaluate(() => window.__lzDbg());
  check('ngrc: the double pendulum carries its own tighter ridge',
    dp.sys === 'double pendulum' && dp.iv < 1 && ivLor === 100,
    JSON.stringify({ lorenz: ivLor, dpend: dp.iv, sys: dp.sys }));
  await demo.selectOption('#lz-sys', 'lorenz');
  await demo.waitForTimeout(400);
  check('ngrc: switching back restores the default ridge',
    (await demo.evaluate(() => window.__lzDbg().iv)) === 100);
}

// soft-sensor tab: warms up + produces a hidden-state estimate
await demo.click('.tab[data-tab="pendulum"]');
await demo.waitForTimeout(3800);
check('ngrc: soft-sensor warms up', (await demo.textContent('#ss-warm')) === 'yes');
check('ngrc: soft-sensor estimate error is finite', Number.isFinite(parseFloat(await demo.textContent('#ss-rmse'))));
if (FULL) {
// the baselines must be real, and the plant must stay nonlinear
{
  const kd = await demo.evaluate(() => window.__ssDbg2());
  // The plant must stay NONLINEAR. If a future edit neutralises the friction,
  // backlash or hardening spring it reverts to a linear plant, where a Kalman
  // filter is provably optimal and this whole comparison is void.
  check('ngrc: plant exercises backlash + stiction', kd.nl && kd.nl.lash > 0.01 && kd.nl.stick > 0.01, JSON.stringify(kd.nl));
  check('ngrc: sensor uses the nonlinear universal map', kd.sensorFeats > 100, String(kd.sensorFeats));
  // No filter is an oracle here — that is the point of the nonlinear plant. The threshold was 0.01
  // and sat right on the natural run-to-run variation of this EWMA meter: a clean run measured
  // 0.00993 and failed, which asserts nothing real. On the LINEAR plant this filter measured
  // 0.0000 (exact to numerical precision), so anything above ~0.002 is already two orders of
  // magnitude away from oracle behaviour and discriminates the claim with margin.
  check('ngrc: exact-linear Kalman is no longer exact', kd.eK > 0.002, String(kd.eK));
  // the nonlinear basis needs data: measured, it ties the filters for ~1200
  // adapt samples and leads from then on. Assert the converged claim on the
  // SAMPLE COUNT, not at an arbitrary wall-clock moment.
  await demo.waitForFunction(() => window.__ssDbg2().adaptN >= 2500, null, { timeout: 60000 });
  const kd2 = await demo.evaluate(() => window.__ssDbg2());
  check('ngrc: learner beats every model-based baseline once trained',
    kd2.eN < kd2.eK && kd2.eN < kd2.eKm && kd2.eN < kd2.eA,
    `n=${kd2.adaptN}: ${kd2.eN} vs ${kd2.eK}/${kd2.eKm}/${kd2.eA}`);
  check('ngrc: Kalman + algebra rows rendered', /^0\./.test(await demo.textContent('#ss-kf')) && /^0\./.test(await demo.textContent('#ss-kfm')) && /^0\./.test(await demo.textContent('#ss-alg')));
  // PLS IS THE REAL INCUMBENT for soft sensing. A Kalman filter needs a physical model, which
  // a composition or wear sensor does not have; PLS regression on the measured signals is what
  // process plants actually deploy, so it is the baseline that decides whether this is a
  // product. It gets the SAME lagged window as the learner and its component count was chosen
  // by sweep (full rank; 3 and 6 both measured worse), so it is not a strawman. FROZEN is the
  // incumbent as deployed; ADAPTIVE is the stronger recursive variant that removes drift.
  // the frozen model is fitted at 3000 adapt samples and the block above only waits for
  // 2500, so wait for the fit rather than assume it — a first version asserted at 2500 and
  // read null for a model that simply had not been built yet.
  await demo.waitForFunction(() => window.__ssDbg2().ePlsF != null, null, { timeout: 90000 });
  const kd3 = await demo.evaluate(() => window.__ssDbg2());
  check('ngrc: both PLS baselines are fitted and finite',
    Number.isFinite(kd3.ePlsA) && Number.isFinite(kd3.ePlsF) && kd3.ePlsA > 0 && kd3.ePlsF > 0,
    JSON.stringify({ frozen: kd3.ePlsF, adaptive: kd3.ePlsA }));
  // measured 1.7-3.6x across training ages; pinned loosely because the ratio moves with what
  // the operator is doing at the moment of reading, and the claim is the direction
  check('ngrc: the learner beats a fully-tuned linear (PLS) soft sensor',
    kd3.eN < kd3.ePlsA * 0.8 && kd3.eN < kd3.ePlsF * 0.8,
    JSON.stringify({ ngrc: kd3.eN, plsAdaptive: kd3.ePlsA, plsFrozen: kd3.ePlsF }));
}
// the forecast is gated on the readout being warm, and says so until then
check('ngrc: 1 s preview reports its warm-up', /^(warming \d+\/\d+|—)$/.test((await demo.textContent('#ss-prev')).trim()) || Number.isFinite(parseFloat(await demo.textContent('#ss-prev'))), await demo.textContent('#ss-prev'));
// the forecast shares the sensor's 169-term basis, so its warm gate is 2500
// trained pairs — the row reads "warming N/2500" until then
await demo.waitForFunction(() => /^[0-9]/.test(document.getElementById('ss-prev').textContent), null, { timeout: 180000 });
check('ngrc: 1 s preview row populated once warm', Number.isFinite(parseFloat(await demo.textContent('#ss-prev'))), await demo.textContent('#ss-prev'));
check('ngrc: soft-sensor has no errors', demoErrors.length === 0, demoErrors.join(' | '));
await demo.screenshot({ path: join(SHOTS, '05-softsensor.png') });

// finger-trace tab: a simulated circular drag makes the model learn
await demo.click('.tab[data-tab="finger"]');
await demo.waitForTimeout(200);
await demo.locator('#fg-stage').scrollIntoViewIfNeeded();
await demo.waitForTimeout(200);
const fbox = await demo.locator('#fg-stage').boundingBox();
const fcx = fbox.x + fbox.width / 2, fcy = fbox.y + fbox.height / 2, fr = Math.min(fbox.width, fbox.height) * 0.3;
await demo.mouse.move(fcx + fr, fcy); await demo.mouse.down();
for (let i = 0; i < 350; i++) { const a = i * 0.1; await demo.mouse.move(fcx + fr * Math.cos(a), fcy + fr * Math.sin(a)); await demo.waitForTimeout(8); }
await demo.mouse.up();
// (still inside the FULL block: this check needs the drag performed above)
check('ngrc: finger-trace learns from a drag (samples > 0)', (parseInt(await demo.textContent('#fg-n')) || 0) > 0);
// the experiment summary must render, keep the experimental model a black box,
// and fully specify the three baselines
{
  await demo.waitForTimeout(1200);
  const ft = await demo.textContent('#fg-sum');
  check('ngrc: finger summary renders all six sections', ft.length > 1500
    && ['SYSTEM.', 'TASK AND SIGNALS.', 'MODELS.', 'PROTOCOL.', 'GRADING.', 'LATEST RESULT'].every(k => ft.includes(k)), String(ft.length));
  check('ngrc: finger summary keeps the experimental model a black box',
    !/NVAR|NG-?RC|next-generation reservoir|polynomial|feature expansion|lag window|stride|delta target/i.test(ft.split('Three fully specified baselines')[0]));
  check('ngrc: finger summary specifies the baselines',
    /method of analogues/.test(ft) && /spectral radius 0\.9/.test(ft) && /32-unit tanh/.test(ft));
}
// the default rung is 10 s — a 10 s horizon can't be scored by a short drag,
// so read the miss at a short rung (the slider's whole point)
await demo.evaluate(() => { const s = document.getElementById('fg-hz'); s.value = 9; s.dispatchEvent(new Event('input', { bubbles: true })); });
await demo.waitForTimeout(300);
check('ngrc: finger-trace error is finite (short rung)', Number.isFinite(parseFloat(await demo.textContent('#fg-rmse'))));
check('ngrc: CPU readout populated (AFM/kNN/app)', /AFM .*%.*kNN .*%.*app .*%/.test(await demo.textContent('#fg-cpu')), await demo.textContent('#fg-cpu'));
await demo.click('#fg-auto');
// commissioning fits the AFM brain (a few seconds) then flips the button
await demo.waitForFunction(() => document.getElementById('fg-auto').textContent.includes('Stop'), null, { timeout: 60000 });
await demo.waitForTimeout(800);
check('ngrc: autopilot commissions + free-runs without errors', demoErrors.length === 0, demoErrors.join(' | '));
check('ngrc: autopilot brain row is populated', /shape|path-locked|AFM|training/.test(await demo.textContent('#fg-ap')));
await demo.screenshot({ path: join(SHOTS, '06-finger.png') });
await demo.click('#fg-auto');

// multi-stroke (disjointed) doodle: two vertical lines drawn with pen lifts —
// the lap must lock WITH gaps, the ghost goes path-family, and the autopilot
// deploys as a path-locked replay (an AFM free-run cannot teleport)
await demo.click('#fg-reset');
await demo.waitForTimeout(300);
await demo.locator('#fg-stage').scrollIntoViewIfNeeded();
await demo.waitForTimeout(200);
const f2 = await demo.locator('#fg-stage').boundingBox();
const mx = f2.x + f2.width / 2, myT = f2.y + f2.height / 2 - 120, myB = f2.y + f2.height / 2 + 120;
for (let rep = 0; rep < 7; rep++) {
  for (const lx of [mx - 65, mx + 65]) {
    await demo.mouse.move(lx, myT); await demo.mouse.down();
    for (let i = 1; i <= 16; i++) { await demo.mouse.move(lx, myT + (myB - myT) * (i / 16)); await demo.waitForTimeout(42); }
    await demo.mouse.up();
    await demo.waitForTimeout(230);
  }
}
const dj = await demo.evaluate(() => window.__fgDbg());
check('ngrc: multi-stroke lap locks with pen-lift gaps', dj.lap > 0 && dj.gaps >= 2, JSON.stringify(dj));
await demo.click('#fg-auto');
await demo.waitForFunction(() => document.getElementById('fg-auto').textContent.includes('Stop'), null, { timeout: 30000 });
check('ngrc: multi-stroke autopilot is path-locked replay', /path-locked replay/.test(await demo.textContent('#fg-ap')), await demo.textContent('#fg-ap'));
await demo.waitForTimeout(2500);
await demo.screenshot({ path: join(SHOTS, '07-multistroke.png') });
await demo.click('#fg-auto');
}   // end FULL-only soft-sensor + finger-trace scenarios

section('ngrc tab3 finger');
// ---- tab 4: anti-slosh axis ----
if (FULL) {
await demo.click('.tab[data-tab="slosh"]');
await demo.waitForTimeout(400);
await demo.evaluate(() => { const s = document.getElementById('sl-speed'); s.value = 3; s.dispatchEvent(new Event('input', { bubbles: true })); });
// off the fixed shaper's design fill is where a frozen tuning is wrong; the experimental machine
// has to retune toward the true resonance and leave less wave for it
await demo.evaluate(() => { window.__slSet({ fill: 0.05 }); document.getElementById('sl-reset').click(); window.__slSet({ fill: 0.05 }); });
await demo.evaluate(() => { const s = document.getElementById('sl-speed'); s.value = 3; s.dispatchEvent(new Event('input', { bubbles: true })); });
await demo.waitForFunction(() => window.__slDbg().moves >= 10, null, { timeout: 120000 });
let sl = await demo.evaluate(() => window.__slDbg());
check('ngrc: anti-slosh axis runs and the plant sloshes', sl.moves >= 10 && sl.convCum > 0.05, JSON.stringify(sl));
check('ngrc: experimental retunes toward the true resonance',
  Math.abs(sl.wHat - sl.wTrue) < Math.abs(sl.wFixed - sl.wTrue), `${sl.wHat} true ${sl.wTrue} fixed ${sl.wFixed}`);
check('ngrc: experimental leaves less wave off the design fill',
  sl.recentConv / Math.max(sl.recentExp, 1e-9) > 2, JSON.stringify({ c: sl.recentConv, e: sl.recentExp }));
// the control must be the worst by a wide margin — if it is not, the "no anti-slosh" machine is
// being shaped by accident and the three-way ladder means nothing
check('ngrc: the no-anti-slosh control is far worse than both shaped machines',
  sl.recentCtrl > sl.recentConv * 1.5 && sl.recentCtrl > sl.recentExp * 5,
  JSON.stringify({ ctrl: sl.recentCtrl, conv: sl.recentConv, exp: sl.recentExp }));
// THE HYBRID'S TWO-SIDED RESULT, and the negative half is the load-bearing one. This is running at
// fill 0.05 where the fixed shaper is mistuned by a third, so the residual wave is a TIMING failure
// and an additive force trim cannot re-time an impulse: the trim must leave the wave essentially
// where it found it (measured 3.038 -> 2.958 mm) while still improving the tracking it CAN fix
// (1.721 -> 1.540 mm). At the design fill, where the shaper is right, it cuts the wave by a third.
check('ngrc: the hybrid trim improves tracking on the machine it is bolted onto',
  sl.hybErr < sl.convErr, JSON.stringify({ conv: sl.convErr, hyb: sl.hybErr }));
check('ngrc: a bolt-on trim cannot fix a MISTUNED shaper (timing, not force)',
  sl.recentHyb > sl.recentConv * 0.75 && sl.recentHyb > sl.recentExp * 3,
  JSON.stringify({ conv: sl.recentConv, hyb: sl.recentHyb, exp: sl.recentExp }));
check('ngrc: the hybrid stays bounded and finite', sl.recentHyb === sl.recentHyb && sl.recentHyb < sl.recentCtrl,
  JSON.stringify({ hyb: sl.recentHyb, ctrl: sl.recentCtrl }));
// THE PARAMETRIC MACHINE: conventional structure, constants identified online. Unlike the trim, a
// parameter learner CAN fix a mistuned shaper, because the resonance it identifies feeds the shaper
// rather than the force — so here (fill 0.05, shaper mistuned) it must beat the conventional machine
// by a wide margin where the trim could not.
check('ngrc: the parametric machine identifies usable constants',
  sl.parP.n > 3 && sl.parP.M > 3 && sl.parP.M < 80 && Math.abs(sl.parP.w - sl.wTrue) < 1.0,
  JSON.stringify(sl.parP));
check('ngrc: learned constants inside the conventional structure beat frozen ones',
  sl.recentPar < sl.recentConv * 0.5 && sl.recentPar < sl.recentHyb * 0.5,
  JSON.stringify({ conv: sl.recentConv, hyb: sl.recentHyb, par: sl.recentPar }));
// THE SUPER HYBRID: both mechanisms stacked on that same structure. The question it answers is
// whether they are redundant — a trim on top of already-correct constants could just as easily be
// fitting noise and adding roughness near the resonance. It is not: the constants cannot produce a
// term the structure does not contain (cogging, the Stribeck shape, the residual the one-time
// calibration leaves), so there is systematic residue left for the trim. It must also not lose the
// parametric machine's tracking, which is the cheap way this could have gone wrong.
check('ngrc: the super hybrid does not lose the parametric machine\'s tracking',
  sl.supErr <= sl.parErr, JSON.stringify({ par: sl.parErr, sup: sl.supErr }));
// stacking has to have CONVERGED to be judged: at 10 moves the identified constants are still
// moving and the two are within 10% of each other (measured 0.373 vs 0.338). A few moves later the
// gap opens to ~3.5x and holds. Reading the ratio at move 10 would be reading a meter before it
// settles — a mistake this project has made before.
await demo.waitForFunction(() => window.__slDbg().moves >= 15, null, { timeout: 120000 });
sl = await demo.evaluate(() => window.__slDbg());
check('ngrc: the two learning mechanisms are complementary, not redundant',
  sl.recentSup === sl.recentSup && sl.recentSup < sl.recentPar * 0.6 && sl.recentSup < sl.recentConv * 0.2,
  JSON.stringify({ conv: sl.recentConv, par: sl.recentPar, sup: sl.recentSup }));
// the physical scale must stay the mirror's (~1.5 mm following error, sub-10 mm waves) — a jump to
// tens of mm means the slosh state has been kicked into divergence somewhere
check('ngrc: following error is at the physical scale', sl.convErr > 0.4 && sl.convErr < 5, String(sl.convErr));
// health check: an UNSHAPED probe, then a named fault. A shaped move leaves no wave to measure.
await demo.click('#sl-check');
await demo.waitForFunction((n) => window.__slDbg().base && window.__slDbg().moves > n, sl.moves, { timeout: 120000 });
check('ngrc: health check captures a healthy baseline', (await demo.evaluate(() => window.__slDbg())).base === true);
// all five faults, not a spot check: the friction route needed a statistic that is IDENTIFIABLE
// over a single move (v and tanh(v/eps) are collinear at cruise, so the viscous/Coulomb split is
// arbitrary and the raw Fc fitted to -0.12 N against a true 5.5), and mount/leak needed a longer
// probe window to leave enough free wave to fit a period to.
for (const [f, re] of [['lubrication', /lubric/i], ['gauge_drift', /gauge/i], ['mount', /mount/i],
  ['leak', /leak/i], ['density', /density/i]]) {
  await demo.evaluate((ff) => window.__slSet({ faults: [ff] }), f);
  sl = await demo.evaluate(() => window.__slDbg());
  await demo.click('#sl-check');
  await demo.waitForFunction((n) => window.__slDbg().moves > n + 1 && !window.__slDbg().probePending
    && window.__slDbg().dwell === 0, sl.moves, { timeout: 180000 });
  sl = await demo.evaluate(() => window.__slDbg());
  check(`ngrc: the fault panel names the ${f} fault`, re.test(sl.diag), sl.diag);
  if (f === 'lubrication') {
    check('ngrc: the conventional following-error alarm stays silent', sl.prodErr < 1.4 * sl.baseErr,
      JSON.stringify({ prod: sl.prodErr, healthy: sl.baseErr }));
  }
  // a mount fault contaminates the friction fit; it must not be reported as a friction fault
  if (f === 'mount') check('ngrc: a mount fault is not misreported as lubrication', !/lubric/i.test(sl.diag), sl.diag);
  // the parametric machine is the ONLY one that adapts friction, so a lubrication fault is where it
  // separates: it must track the raised Coulomb term instead of carrying the textbook 5.5 N.
  if (f === 'lubrication') {
    check('ngrc: the parametric machine tracks the raised friction', sl.parP.Fc > 9,
      JSON.stringify({ Fc: sl.parP.Fc }));
    // NOTE what is and is not claimed here. The fault is injected MID-SESSION and checked ~2 moves
    // later, so the friction estimate is still converging and the 8-move scoring window is mostly
    // pre-fault: measured 0.472 parametric against 0.472 experimental, a tie. The converged
    // advantage (6.5-12x, fault present from the first move) is measured separately and recorded in
    // CLAUDE.md - asserting it here would be reading a meter before it has settled, which is a
    // mistake this project has made before. What IS true at this point, and worth pinning: adapting
    // friction is never WORSE than not adapting it, and both beat the frozen-constant machine.
    check('ngrc: adapting friction is no worse than not adapting it, and both beat frozen constants',
      sl.recentPar <= sl.recentExp * 1.1 && sl.recentPar < sl.recentConv * 0.6,
      JSON.stringify({ conv: sl.recentConv, exp: sl.recentExp, par: sl.recentPar }));
  }
}
await demo.evaluate(() => window.__slSet({ faults: [] }));
// the gauge can die and the axis keeps running off its own force and motion
await demo.click('#sl-gauge');
sl = await demo.evaluate(() => window.__slDbg());
await demo.waitForFunction((n) => window.__slDbg().moves >= n + 4, sl.moves, { timeout: 120000 });
sl = await demo.evaluate(() => window.__slDbg());
check('ngrc: survives losing the level gauge', sl.gaugeDead && sl.expWave === sl.expWave && sl.expWave < 5, JSON.stringify(sl));
await demo.click('#sl-gauge');
const slSum = await demo.textContent('#sl-sum');
check('ngrc: anti-slosh summary reports the control', /no anti-slosh/.test(slSum) && /CONTROL \(no anti-slosh\)/.test(slSum));
check('ngrc: anti-slosh summary reports the parametric machine',
  /PARAMETRIC: the conventional STRUCTURE exactly/.test(slSum) && /adapts FRICTION/.test(slSum));
check('ngrc: anti-slosh summary reports the super hybrid',
  /SUPER HYBRID: both learning mechanisms at once/.test(slSum) && /redundant or\s+complementary/.test(slSum)
  && /The SUPER HYBRID runs both mechanisms/.test(slSum));
check('ngrc: anti-slosh summary reports the hybrid retrofit',
  /HYBRID \(the retrofit\)/.test(slSum) && /NOT MODIFIED IN ANY WAY/.test(slSum) && /failure of TIMING/.test(slSum));
check('ngrc: anti-slosh summary renders all six sections',
  ['SYSTEM.', 'TASK AND SIGNALS.', 'MODELS.', 'PROTOCOL.', 'GRADING.', 'LATEST RESULT'].every((k) => slSum.includes(k)));
{
  // black-box contract. It is audited over the WHOLE models section, not just the experimental
  // paragraph: four of the six machines now carry a piece of the withheld method (the trim, the
  // identified constants, both stacked, and the experimental estimator itself), so a leak in any
  // of their descriptions is the same leak. The conventional baseline sits in the same section and
  // is fully specified — it just does not use any of these terms.
  const own = slSum.split('PROTOCOL.')[0].split('MODELS.')[1] || '';
  check('ngrc: anti-slosh experimental method stays a black box',
    !/NVAR|NG-?RC|next-generation reservoir|polynomial|feature expansion|lag window|stride|recursive least squares|ridge|covariance/i.test(own),
    own.slice(0, 160));
  check('ngrc: anti-slosh withholding is stated explicitly', /intentionally NOT disclosed/.test(slSum));
  check('ngrc: anti-slosh baseline is fully specified',
    /ZVD input shaper/.test(slSum) && /Kp 4200/.test(slSum) && /M\*a_ref \+ B\*v_ref/.test(slSum));
}
// MOVE SPEED, PROFILE and the SECOND SLOSH MODE (v108). Placed at the END of the
// tab-4 section on purpose: toggling the second mode changes the PLANT and therefore
// calls slReset, and an earlier placement reset the machines underneath the fault
// tests that follow — the parametric machine's friction estimate had not reconverged
// and its check failed. Same mistake, same fix, as the tab-1 ridge check.
// MOVE SPEED, PROFILE and the SECOND SLOSH MODE (v108). The move-speed slider is the
// cycle-time knob the tab exists to justify, and it must scale the commanded motion
// without touching the sim rate; the S-curve must preserve the stroke while taking
// longer; and the second mode must be OFF by default, because with it on the
// resonance estimator is fooled (14.3 rad/s reported against a plant with 9.3 and
// 17.5) and the adaptive machines lose to the fixed shaper for a reason that is an
// instrument defect rather than a property of the method.
{
  const base = await demo.evaluate(() => window.__slDbg());
  check('ngrc: the second slosh mode is off by default',
    base.mode3 === false && base.modes.length === 1 && base.moveSpd === 1 && base.profile === 'trap',
    JSON.stringify({ mode3: base.mode3, modes: base.modes.length, spd: base.moveSpd, prof: base.profile }));
  const trapLen = base.moveLen;
  await demo.evaluate(() => window.__slSet({ profile: 'scurve' }));
  await demo.waitForFunction((n) => window.__slDbg().moves > n + 1, base.moves, { timeout: 60000 });
  const sc = await demo.evaluate(() => window.__slDbg());
  check('ngrc: the S-curve lengthens the move (jerk limit) without changing the stroke',
    sc.moveLen > trapLen, JSON.stringify({ trap: trapLen, scurve: sc.moveLen }));
  await demo.evaluate(() => window.__slSet({ profile: 'trap', moveSpd: 2.0 }));
  await demo.waitForFunction((n) => window.__slDbg().moves > n + 1, sc.moves, { timeout: 60000 });
  const fast = await demo.evaluate(() => window.__slDbg());
  check('ngrc: a faster move speed shortens the commanded move',
    fast.moveLen < trapLen && fast.moveSpd === 2, JSON.stringify({ x1: trapLen, x2: fast.moveLen }));
  // the second mode's parameters are DERIVED, not fitted - if a later edit invents them
  // this catches it (w3/w1 = 1.88 and the wall weight 0.111 at the nominal fill)
  await demo.evaluate(() => window.__slSet({ moveSpd: 1.0, mode3: true }));
  await demo.waitForTimeout(600);
  const m3 = await demo.evaluate(() => window.__slDbg());
  // assert the CLOSED FORM, not a number: w3/w1 = sqrt(3*tanh(3*pi*h/L)/tanh(pi*h/L)),
  // which is fill-dependent (1.878 at 0.12 m, 2.393 at the 0.05 m this suite runs at) —
  // an earlier version of this check hardcoded the 0.12 m value and failed here for that
  // reason alone. The wall weight tends to exactly 1/n^2 = 0.111 in deep water.
  const hFill = m3.hTrue, LT = 0.30;
  const wRatio = Math.sqrt(3 * Math.tanh(3 * Math.PI * hFill / LT) / Math.tanh(Math.PI * hFill / LT));
  check('ngrc: the second slosh mode matches the derived modal physics',
    m3.modes.length === 2 && Math.abs(m3.modes[1].w / m3.modes[0].w - wRatio) < 0.02
    && Math.abs(m3.modes[1].wt - 0.111) < 0.01,
    JSON.stringify({ modes: m3.modes, fill: hFill, expectedRatio: +wRatio.toFixed(3) }));
  // THE TWO-MODE PLANT MUST NOW BE WINNABLE. Before the probe-only retune the estimate
  // oscillated 9.3 <-> 14.2 every move and the experimental machine lost to the fixed
  // shaper; with it, the estimate holds and the adaptive machines beat conventional by ~7x
  // off the design fill. Pinned because the failure was silent - nothing else in the suite
  // exercises the second mode at all.
  await demo.evaluate(() => window.__slSet({ mode3: true, fill: 0.05 }));
  const m3n = (await demo.evaluate(() => window.__slDbg())).moves;
  await demo.waitForFunction((n) => window.__slHist().sup.length >= n + 18, m3n, { timeout: 240000 });
  const two = await demo.evaluate(() => ({ h: window.__slHist(), s: window.__slDbg() }));
  const tail = (a) => a.slice(-8).reduce((x, y) => x + y, 0) / 8;
  const cv = tail(two.h.conv), ex = tail(two.h.exp), sp = tail(two.h.sup);
  check('ngrc: with two slosh modes the adaptive machines still beat the fixed shaper',
    ex < cv * 0.35 && sp < cv * 0.35,
    JSON.stringify({ conv: +cv.toFixed(3), exp: +ex.toFixed(3), sup: +sp.toFixed(3) }));
  // and the resonance estimate must STAY PUT rather than walking onto mode 3
  check('ngrc: the two-mode resonance estimate does not run away',
    Math.abs(two.s.wHat - two.s.wTrue) / two.s.wTrue < 0.15,
    JSON.stringify({ wHat: +two.s.wHat.toFixed(2), wTrue: +two.s.wTrue.toFixed(2) }));
  await demo.evaluate(() => window.__slSet({ mode3: false, fill: 0.05 }));
  await demo.waitForTimeout(400);
}
await demo.evaluate(() => window.scrollTo(0, 0));
await demo.waitForTimeout(300);
await demo.screenshot({ path: join(SHOTS, '08-antislosh.png') });

check('ngrc: playground has no errors overall', demoErrors.length === 0, demoErrors.join(' | '));

// ============================================================================
// LATTSIM — the lattice physics engine. Its numerics are verified in Node
// (test/lattsim/*.test.mjs) against analytic answers; what is checked HERE is
// that the page builds a real simulation, degrades honestly when WebGPU is
// absent (which it is in this Chromium), and draws actual field data.
// ============================================================================
// Close the NGRC page first. Chromium's software WebGPU drops the device
// instance for backgrounded pages, which surfaces as "a valid external Instance
// reference no longer exists" the moment LattSim tries to read anything back.
await demo.close();
}   // end FULL-only ngrc page

}   // end FULL-only anti-slosh scenarios
section('ngrc tab4 antislosh');
section('lattsim page');
const latt = await ctx.newPage();
const lattErrors = [];
latt.on('pageerror', e => lattErrors.push(String(e)));
// Also capture console.error. The page catches its own async failures and logs
// them rather than letting them reach pageerror, so without this a broken render
// path would show up only as a red badge in a screenshot nobody read.
const lattConsole = [];
latt.on('console', m => { if (m.type() === 'error') lattConsole.push(m.text()); });
await latt.goto(BASE + 'lattsim.html', { waitUntil: 'networkidle' });
await latt.waitForFunction(() => window.__lsDbg && window.__lsDbg().backend !== null, null, { timeout: 60000 });

check('lattsim.html loads with no errors', lattErrors.length === 0, lattErrors.join(' | '));

const ls0 = await latt.evaluate(() => window.__lsDbg());
check('lattsim: a simulation is built', ls0.cells > 0, JSON.stringify(ls0.cells));
check('lattsim: geometry is classified (fluid + solid + inlet + outlet)',
  ls0.census && ls0.census.FLUID > 0 && ls0.census.SOLID > 0 && ls0.census.INLET > 0 && ls0.census.OUTLET > 0,
  JSON.stringify(ls0.census));
// This Chromium has no navigator.gpu at all, so the honest outcome is the CPU
// reference plus a stated reason -- not a blank canvas and not a pretence.
const hasGPU = await latt.evaluate(() => !!navigator.gpu);
check('lattsim: backend selection matches what the browser actually offers',
  hasGPU ? ls0.backend === 'webgpu' : ls0.backend === 'cpu', `${ls0.backend} (navigator.gpu=${hasGPU})`);
if (!hasGPU) {
  check('lattsim: the WebGPU fallback states its reason', !!ls0.fallback, String(ls0.fallback));
  check('lattsim: the badge says so', /CPU reference/.test(await latt.textContent('#backend-badge')),
    await latt.textContent('#backend-badge'));
}

// Physics must actually advance and stay finite.
await latt.evaluate(() => window.__lsStep(200));
const diag = await latt.evaluate(() => window.__lsDiag());
check('lattsim: stepping advances the solver', diag.step >= 200, String(diag.step));
check('lattsim: the field is finite and stable', diag.finite && diag.stable.state !== 'diverged',
  JSON.stringify(diag.stable));
// The density range is the diagnostic that caught the first outlet
// implementation: it copied its neighbour's populations, imposed nothing on the
// pressure, and drained the channel to rho = 0.32 while the velocity field still
// looked like flow and the run was not diverging.
//
// The band is +/-20% rather than +/-2% because the outlet is FIRST ORDER and
// mildly reflective, so an impulsive start rings an acoustic wave between the
// two open faces which decays slowly: measured +/-17% at step 200, +/-13% at
// 600, +/-5% by 2200. That is a documented property of this boundary, not
// instability -- and 0.8 still catches the 0.32 drain by a factor of three.
check('lattsim: density stays physical (the outlet anchors the pressure)',
  diag.rhoMin > 0.8 && diag.rhoMax < 1.25, `${diag.rhoMin} … ${diag.rhoMax}`);
check('lattsim: the inlet drives a flow', diag.uMax > 1e-3, String(diag.uMax));

// The slice renderer must draw real field data, not an empty canvas.
await latt.evaluate(() => window.__lsDraw());
await latt.waitForTimeout(200);
const px = await latt.evaluate(() => {
  const c = document.getElementById('cv');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  return { w: c.width, h: c.height, colors: seen.size };
});
check('lattsim: the slice canvas is the lattice cross-section', px.w > 8 && px.h > 8, JSON.stringify(px));
check('lattsim: the slice shows a field, not one flat colour', px.colors > 8, String(px.colors));

// ---- THE PARITY CHECK, the reason both backends exist.
// The Node tests verify the CPU reference against analytic answers. This
// verifies that the production WGSL kernel computes the SAME THING. Two
// implementations of one set of equations drift the moment nobody compares
// them, and the drift looks like a plausible flow rather than an error.
if (hasGPU && ls0.backend === 'webgpu') {
  const parity = await latt.evaluate(async () => {
    const [{ channelFlow }] = await Promise.all([import('./lib/lattsim/scenes.js')]);
    const mk = () => channelFlow({ resolution: 16, tau: 0.6, inletVelocity: 0.05 });
    const g = mk(); await g.build({ backend: 'webgpu' });
    const c = mk(); await c.build({ backend: 'cpu' });
    g.advance(60); c.advance(60);
    const [mg, mc] = [await g.backend.snapshot('macro'), await c.backend.snapshot('macro')];
    const N = g.lattice.cellCount;
    let worstU = 0, worstR = 0, peak = 0;
    for (let i = 0; i < N; i++) {
      if (g.flags[i] === 1) continue;
      worstR = Math.max(worstR, Math.abs(mg[i] - mc[i]));
      for (let k = 1; k < 4; k++) {
        worstU = Math.max(worstU, Math.abs(mg[k * N + i] - mc[k * N + i]));
        peak = Math.max(peak, Math.abs(mc[k * N + i]));
      }
    }
    const out = { worstU, worstR, peak, cells: N,
      gpu: (await g.diagnostics()).mass, cpu: (await c.diagnostics()).mass };
    g.destroy(); c.destroy();
    return out;
  });
  // Both run f32 and both are chaotic-free at this size, so agreement should be
  // at the level of float accumulation order, not of physics.
  check('lattsim: the WGSL kernel and the CPU reference agree on velocity',
    parity.worstU < 1e-4 * Math.max(parity.peak, 1e-6) + 1e-6,
    `worst |du| ${parity.worstU.toExponential(2)} against peak ${parity.peak.toExponential(2)}`);
  check('lattsim: the two backends agree on density',
    parity.worstR < 1e-5, parity.worstR.toExponential(2));
  check('lattsim: the two backends agree on total mass',
    Math.abs(parity.gpu - parity.cpu) / parity.cpu < 1e-5,
    `${parity.gpu} vs ${parity.cpu}`);
}

check('lattsim: the GPU driver reported no uncaptured errors', (ls0.gpuErrors || []).length === 0,
  JSON.stringify(ls0.gpuErrors));

// THE CONSOLE BUFFER IS PERSISTED TO localStorage AND IS PER ORIGIN, not per
// page -- deliberately, so a white-screen crash survives a reload. The side
// effect is that this page inherits the `console.error('smoke error')` this very
// suite injects on index.html to test console capture, which is what put a red
// error badge on the LattSim screenshot and sent me looking for a bug that was
// not there. Clear it here so the end-of-section check is about THIS page.
await latt.evaluate(() => window.__dbg.clear());
await checkConsoleUsable(latt, 'lattsim');

// ---- THE SHIPPED DEFAULTS MUST SURVIVE. This shipped broken once: the default
// collision model was one that had ALREADY BEEN MEASURED dying at the default
// cell Reynolds number, and the page's own risk row called it "within the
// measured stable range" because the ceiling table had copied BGK's number for
// it. Load the page, run it, and require it to still be alive.
{
  const info = await latt.evaluate(() => window.__lsInfo());
  check('lattsim: the build logs its parameters to the page console',
    info && typeof info.ReCell === 'number' && info.collision && info.trtPolicy
    && typeof info.Cs === 'number' && typeof info.omegaMinus === 'number', JSON.stringify(info));
  // ONE configuration ships. The alternatives stay in the library for the
  // analytic comparisons; offering them here is what put a diverging default
  // in front of the user.
  check('lattsim: the page ships the measured-stable configuration only',
    info.collision === 'trt' && info.trtPolicy === 'stability' && info.Cs > 0,
    JSON.stringify({ collision: info.collision, policy: info.trtPolicy, Cs: info.Cs }));
  check('lattsim: there is no collision-model selector to get wrong',
    await latt.evaluate(() => document.getElementById('physics') === null));
  check('lattsim: the default Re_cell is inside the default model\'s measured ceiling',
    info.ReCell < info.ceiling, `Re_cell ${info.ReCell.toFixed(1)} vs ceiling ${info.ceiling}`);
  const live = await latt.evaluate(async () => {
    const sim = window.__lsSim();
    for (let k = 0; k < 4; k++) {
      sim.advance(200);
      const d = await sim.diagnostics();
      if (d.stable.state === 'diverged') return { ok: false, step: d.step, why: d.stable.why };
    }
    const d = await sim.diagnostics();
    return { ok: true, step: d.step, uMax: d.uMax };
  });
  // 800 steps: the default that shipped broken diverged by step 300, so this is
  // well past the point that catches it, and TRT+LES on a software GPU is
  // expensive enough that the step count is most of the quick tier's clock.
  check('lattsim: the shipped defaults run 800 steps without diverging', live.ok,
    JSON.stringify(live));
}

section('lattsim core');
if (FULL) {
// ---- every scene must show something. Reported from a real device: two of the
// three "did nothing visible". They were all correct; the DEFAULT SLICE PLANE was
// wrong for them -- Poiseuille varies only across z, so the plane normal to z has
// exactly zero spread and renders as one flat colour. Each scene now declares the
// plane that shows its physics; this checks the page applies it and that pixels
// actually vary.
for (const [key, label] of [['poiseuille', 'Poiseuille'], ['cavity', 'cavity'], ['channel', 'channel']]) {
  await latt.selectOption('#scene', key);
  await latt.waitForFunction(() => window.__lsDbg().backend !== null && !window.__lsDbg().building,
    null, { timeout: 60000 });
  // STEPS SCALED TO THE DOMAIN. The channel is now 3x long, so at a fixed 1500
  // steps the inlet flow had not crossed it and the slice was still mostly at
  // rest -- 3 distinct colours, which reads as "renders nothing" when the scene
  // is fine and simply young. Give every scene time for the flow to traverse it.
  await latt.evaluate(() => {
    const L = window.__lsSim().lattice;
    window.__lsStep(Math.max(1500, L.nx * 40));
  });
  await latt.evaluate(() => window.__lsDraw());
  await latt.waitForTimeout(250);
  const shot = await latt.evaluate(() => {
    const c = document.getElementById('cv');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return { colors: seen.size, axis: document.getElementById('axis').value };
  });
  check(`lattsim: the ${label} scene renders a varying field on its default slice`,
    shot.colors > 12, `${shot.colors} distinct colours on slice axis ${shot.axis}`);
  await latt.locator('#stage').screenshot({ path: join(SHOTS, `11-lattsim-${key}.png`) });
}
await latt.selectOption('#scene', 'channel');
await latt.waitForFunction(() => !window.__lsDbg().building, null, { timeout: 60000 });

// ---- the resolution ladder must be clamped to what the device can allocate
// rather than attempted and left broken. The channel at 96 wants a 128.3 MiB
// storage binding against a 128 MiB default limit; before this it failed, fell
// through to a CPU backend far over its own cap, and left the page with no
// simulation at all.
const resInfo = await latt.evaluate(() => ({
  max: +document.getElementById('res').max,
  built: window.__lsDbg().cells > 0,
}));
check('lattsim: the resolution slider is clamped to what the device can allocate',
  resInfo.max >= 0 && resInfo.max <= 4 && resInfo.built, JSON.stringify(resInfo));
await latt.evaluate((m) => {
  const r = document.getElementById('res'); r.value = String(m);
  r.dispatchEvent(new Event('change'));
}, resInfo.max);
await latt.waitForFunction(() => !window.__lsDbg().building, null, { timeout: 180000 });
const atMax = await latt.evaluate(() => window.__lsDbg());
check('lattsim: the largest offered resolution actually builds',
  atMax.cells > 0 && atMax.backend !== null, JSON.stringify({ cells: atMax.cells, backend: atMax.backend }));

// ---- the raymarched volume view.
//
// IT CANNOT BE RENDERED HERE, and the reason is worth recording. In this
// headless Chromium with a software adapter there is no real surface, and
// getCurrentTexture() does not merely fail -- it destroys the WebGPU instance,
// after which every COMPUTE call fails too. Isolated to fifteen lines of plain
// WebGPU with none of this engine involved. So the suite does NOT switch to that
// view: doing so takes the simulation down with it and proves nothing.
//
// What IS checkable without a surface is that the volume shader compiles, which
// is where a WGSL mistake would live -- and this project has already shipped one
// of those (`macro`, a reserved word) that produced silence rather than an error.
// The picture itself is verified on a real device.
if (hasGPU && ls0.backend === 'webgpu') {
  const volShader = await latt.evaluate(async () => {
    const [{ VolumeRenderer }, { Lattice }, { acquireDevice }] = await Promise.all([
      import('./lib/lattsim/render/volume3d.js'),
      import('./lib/lattsim/lattice.js'),
      import('./lib/lattsim/backends/webgpu.js'),
    ]);
    const { device } = await acquireDevice();
    const code = VolumeRenderer.shaderSource(new Lattice({ size: [16, 8, 8], spacing: 1e-3 }));
    device.pushErrorScope('validation');
    const mod = device.createShaderModule({ code });
    const info = await mod.getCompilationInfo();
    const scoped = await device.popErrorScope();
    return {
      errors: info.messages.filter((m) => m.type === 'error').map((m) => `${m.lineNum}:${m.linePos} ${m.message}`),
      scoped: scoped ? scoped.message : null,
    };
  });
  check('lattsim: the volume shader compiles',
    volShader.errors.length === 0 && !volShader.scoped, JSON.stringify(volShader));
}

// ---- Reset must reset the SIMULATION, not the controls. Reported from a real
// device: pressing it put the view back to 2D and moved the slice.
{
  // Drop back to the smallest lattice first: the resolution check above left the
  // sim at the largest one the device allows, and the stir check below steps
  // several thousand times on a software GPU.
  await latt.evaluate(() => {
    const r = document.getElementById('res'); r.value = '0';
    r.dispatchEvent(new Event('change'));
  });
  await latt.waitForFunction(() => !window.__lsDbg().building, null, { timeout: 120000 });
  await latt.selectOption('#scene', 'channel');
  await latt.waitForFunction(() => !window.__lsDbg().building, null, { timeout: 60000 });
  // FORCE A LAMINAR REGIME FOR THE SETTLE TEST. The shipped defaults now sit at
  // Re ~120, ABOVE this geometry's shedding threshold -- so the channel is
  // supposed to oscillate forever and "the residual falls to steady" is the
  // wrong expectation for it. Asking a shedding flow to converge would be
  // testing that the physics is absent. tau 0.6 / u 0.04 puts Re near 7.
  await latt.evaluate(() => {
    const t = document.getElementById('tau'); t.value = '0.6'; t.dispatchEvent(new Event('input'));
    const u = document.getElementById('uin'); u.value = '0.04'; u.dispatchEvent(new Event('input'));
    u.dispatchEvent(new Event('change'));
  });
  await latt.waitForFunction(() => !window.__lsDbg().building && !window.__lsDbg().queued,
    null, { timeout: 120000 });
  await latt.selectOption('#axis', '1');
  await latt.evaluate(() => {
    const s = document.getElementById('slicep'); s.value = '0.25';
    s.dispatchEvent(new Event('input'));
  });
  const before = await latt.evaluate(() => ({
    axis: document.getElementById('axis').value,
    pos: document.getElementById('slicep').value,
    view: document.getElementById('view').value,
  }));
  await latt.click('#reset');
  await latt.waitForFunction(() => !window.__lsDbg().building, null, { timeout: 60000 });
  const after = await latt.evaluate(() => ({
    axis: document.getElementById('axis').value,
    pos: document.getElementById('slicep').value,
    view: document.getElementById('view').value,
    step: window.__lsDbg().step,
  }));
  check('lattsim: Reset keeps the view settings', after.axis === before.axis
    && after.pos === before.pos && after.view === before.view,
    JSON.stringify({ before, after }));
  check('lattsim: Reset does restart the simulation', after.step === 0, String(after.step));

  // A REBUILD ASKED FOR MID-REBUILD MUST NOT BE SWALLOWED. build() used to
  // return early while one was in flight, so on a phone -- where a rebuild takes
  // seconds -- a Reset tap simply vanished. That is what "Reset doesn't work
  // consistently" looks like from the outside.
  const queued = await latt.evaluate(async () => {
    const before = window.__lsDbg().step;
    window.__lsStep(50);
    document.getElementById('reset').click();
    document.getElementById('reset').click();   // second tap lands mid-rebuild
    const sawQueue = window.__lsDbg().queued || window.__lsDbg().building;
    return { before, sawQueue };
  });
  await latt.waitForFunction(() => !window.__lsDbg().building && !window.__lsDbg().queued,
    null, { timeout: 120000 });
  const afterQueue = await latt.evaluate(() => window.__lsDbg());
  check('lattsim: a Reset pressed during a rebuild is queued, not dropped',
    queued.sawQueue && afterQueue.step === 0 && afterQueue.cells > 0,
    JSON.stringify({ queued, step: afterQueue.step, cells: afterQueue.cells }));


  // A DIVERGED RUN MUST SAY SO WHERE THE USER IS LOOKING, AND MUST NOT PRETEND
  // IT CAN CONTINUE.
  //
  // Reported from a device: tau at the slider floor with everything else default
  // ran a few seconds, then "broke" -- a frozen picture with a front sweeping
  // across it, and Run doing one step and freezing again. That is genuine
  // numerical divergence (velocity overflows, rho crosses zero, u = m/rho goes
  // non-finite, and STREAMING then carries the NaN one cell per step to every
  // neighbour), and halting is right. What was wrong is that it halted with the
  // reason in a stats row below the fold, so from the outside it just broke.
  {
    await latt.evaluate(() => {
      const t = document.getElementById('tau'); t.value = t.min; t.dispatchEvent(new Event('input'));
      const u = document.getElementById('uin'); u.value = u.max; u.dispatchEvent(new Event('input'));
      u.dispatchEvent(new Event('change'));
    });
    await latt.waitForFunction(() => !window.__lsDbg().building && !window.__lsDbg().queued,
      null, { timeout: 120000 });
    // Assert the STATE, not the phrasing -- a check that greps the sentence
    // breaks every time the sentence improves.
    check('lattsim: an unstable slider pairing is flagged BEFORE it is run',
      await latt.evaluate(() => document.getElementById('tau-v').className.includes('bad')),
      await latt.textContent('#s-risk'));

    // Drive it until it dies. It should not take long at the stability floor.
    const died = await latt.evaluate(async () => {
      const sim = window.__lsSim();
      for (let k = 0; k < 30; k++) {
        sim.advance(200);
        const d = await sim.diagnostics();
        if (d.stable.state === 'diverged') return { step: d.step, why: d.stable.why };
      }
      return null;
    });
    if (died) {
      await latt.evaluate(() => window.__lsRefresh());
      const ui = await latt.evaluate(() => ({
        badge: document.getElementById('backend-badge').textContent,
        badgeBad: /bad/.test(document.getElementById('backend-badge').className),
        runDisabled: document.getElementById('run').disabled,
        runText: document.getElementById('run').textContent,
      }));
      check('lattsim: divergence is announced on the stage, not only in a stats row',
        ui.badgeBad && /DIVERGED/.test(ui.badge), JSON.stringify(ui));
      check('lattsim: Run refuses to resume a diverged run', ui.runDisabled && /Reset/.test(ui.runText),
        JSON.stringify(ui));
      // ...and Reset must clear the latch, or the page is stuck for good.
      await latt.click('#reset');
      await latt.waitForFunction(() => !window.__lsDbg().building && !window.__lsDbg().queued,
        null, { timeout: 120000 });
      const after = await latt.evaluate(() => ({
        runDisabled: document.getElementById('run').disabled,
        step: window.__lsDbg().step,
      }));
      check('lattsim: Reset clears the divergence and re-enables Run',
        !after.runDisabled && after.step === 0, JSON.stringify(after));
    } else {
      check('lattsim: the stability floor actually diverges (so the check has teeth)', false,
        'ran 6000 steps at the slider floor without diverging');
    }
    // Back to something sane for whatever follows.
    await latt.evaluate(() => {
      const t = document.getElementById('tau'); t.value = '0.6'; t.dispatchEvent(new Event('input'));
      const u = document.getElementById('uin'); u.value = '0.04'; u.dispatchEvent(new Event('input'));
      u.dispatchEvent(new Event('change'));
    });
    await latt.waitForFunction(() => !window.__lsDbg().building && !window.__lsDbg().queued,
      null, { timeout: 120000 });
  }

  // RESET WHILE RUNNING, which is what a person actually does. A readback is
  // asynchronous, so tearing the backend down mid-run used to destroy a staging
  // buffer with a mapAsync in flight and reject it with nobody listening.
  //
  // That is an UNHANDLED REJECTION, and it is why this check reads the page's
  // OWN error buffer rather than trusting the two listeners above: neither
  // Playwright's `pageerror` nor the console listener reports unhandled
  // rejections, so every existing error assertion passed while the live page
  // showed a red error badge on every Reset. It was found in a screenshot.
  await latt.evaluate(() => { window.__dbg.clear && window.__dbg.clear(); });
  await latt.click('#run');
  await latt.waitForTimeout(1200);
  await latt.click('#reset');
  await latt.waitForFunction(() => !window.__lsDbg().building, null, { timeout: 60000 });
  await latt.waitForTimeout(1200);
  const pageErrs = await latt.evaluate(() =>
    window.__dbg.buffer().filter((e) => e.type === 'error').map((e) => String(e.text).slice(0, 200)));
  check('lattsim: resetting while running raises no error, unhandled rejections included',
    pageErrs.length === 0, pageErrs.join(' | '));
  if (await latt.evaluate(() => window.__lsDbg().running)) await latt.click('#run');   // leave it paused
}

// ---- stirring is a physics input, and the residual shows the flow settle again
{
  // EVERY RESIDUAL HERE IS READ OVER THE SAME NUMBER OF STEPS. The residual is
  // per step, so the gaps no longer have to match for the number to mean the
  // same thing -- but a 20-step window straddling a 24-step impulse averages
  // very differently from an 800-step one, so matching them keeps the three
  // readings comparable as measurements rather than just as units. The first
  // version of this check compared a 600-step gap against a 10-step gap and
  // "failed" because of the observation window, not the physics.
  const GAP = 20;
  const readAfter = async (steps) => {
    await latt.evaluate((n) => window.__lsStep(n), steps);
    await latt.evaluate(() => window.__lsDiag());          // anchor the reading
    await latt.evaluate((n) => window.__lsStep(n), GAP);
    return latt.evaluate(() => window.__lsDiag());
  };

  const calm = await readAfter(2400);
  check('lattsim: the driven channel settles on its own', calm.stable.why === 'steady',
    `residual/step ${calm.residual.toExponential(2)} — ${calm.stable.state} ${calm.stable.why}`);

  // THE LOCAL CHECK IS THE ONE THAT MATTERS HERE. The node suite already proves
  // the operator injects momentum, conserves mass and expires. What only the
  // browser can prove is the chain this page adds: a screen coordinate on a
  // letterboxed canvas -> a slice plane -> a lattice cell. So compare the
  // velocity change INSIDE the impulse sphere against everywhere else.
  //
  // A global metric cannot do this job. The first version asserted the residual
  // rose, and a correctly-armed impulse moved it by less than the flow's own
  // fluctuation -- 33 cells out of 27648 is 0.02% of the momentum. That read as
  // "the stir does nothing" when the stir was fine and the instrument was wrong.
  const probe = await latt.evaluate(async () => {
    const s = document.getElementById('stir'); s.value = s.max; s.dispatchEvent(new Event('input'));
    const sim = window.__lsSim(), L = sim.lattice, N = L.cellCount;
    const before = await sim.backend.snapshot('macro');
    const r = document.getElementById('stage').getBoundingClientRect();
    window.__lsStir(r.left + r.width * 0.4, r.top + r.height * 0.5, 40, 0);
    const im = JSON.parse(JSON.stringify(sim.operators[0].params.impulse));
    window.__lsStep(20);
    const after = await sim.backend.snapshot('macro');
    const sp = (m, i) => Math.hypot(m[N + i], m[2 * N + i], m[3 * N + i]);
    let din = 0, nin = 0, dout = 0, nout = 0;
    for (let z = 0; z < L.nz; z++) for (let y = 0; y < L.ny; y++) for (let x = 0; x < L.nx; x++) {
      const i = L.index(x, y, z);
      const d = Math.hypot(x - im.centre[0], y - im.centre[1], z - im.centre[2]);
      const dv = Math.abs(sp(after, i) - sp(before, i));
      if (d <= im.radius) { din += dv; nin++; } else { dout += dv; nout++; }
    }
    return { im, size: [L.nx, L.ny, L.nz], inside: din / Math.max(1, nin), outside: dout / Math.max(1, nout), nin };
  });
  check('lattsim: a drag arms an impulse at an interior cell, in the drag direction',
    probe.im.force[0] > 0 && probe.im.radius >= 4 && probe.im.steps > 0
    && probe.im.centre.every((v, k) => v > 0 && v < probe.size[k] - 1),
    JSON.stringify({ impulse: probe.im, lattice: probe.size }));
  // Measured 36x at the default strength and 50x at the maximum; 10x is a floor
  // well clear of both, and far above the ~1x a mis-mapped coordinate would give.
  check('lattsim: the momentum lands under the finger, not spread over the domain',
    probe.inside > probe.outside * 10,
    `mean d|u| inside ${probe.inside.toExponential(2)} vs outside ${probe.outside.toExponential(2)} `
    + `(${(probe.inside / probe.outside).toFixed(0)}x over ${probe.nin} cells)`);

  const poked = await latt.evaluate(() => window.__lsDiag());
  check('lattsim: stirring shows up in the global residual too', poked.residual > calm.residual * 5,
    `residual/step ${calm.residual.toExponential(2)} -> ${poked.residual.toExponential(2)}`);

  const settled = await readAfter(2400);
  check('lattsim: the flow settles again after being stirred',
    settled.residual < poked.residual / 10 && settled.stable.state !== 'diverged',
    `${poked.residual.toExponential(2)} -> ${settled.residual.toExponential(2)} (${settled.stable.state})`);
}

}   // end FULL-only LattSim scenarios

section('lattsim scenarios');
const stats = await latt.textContent('#s-lattice');
check('lattsim: the lattice is described in the UI', /cells/.test(stats || ''), stats);
check('lattsim: field memory is reported', /(KiB|MiB)/.test(await latt.textContent('#s-mem')),
  await latt.textContent('#s-mem'));

await latt.evaluate(() => window.scrollTo(0, 0));
await latt.waitForTimeout(200);
await latt.screenshot({ path: join(SHOTS, '09-lattsim.png') });

// ---- THE PROBE MUST READ THE CELL IT POINTS AT.
//
// This is the same class of check as the stir: a screen coordinate on a
// letterboxed canvas -> a slice plane -> a lattice cell, and a mistake anywhere
// in that chain gives a plausible-looking trace of the WRONG cell. So the probe
// is placed by screen coordinate and its reading is compared against a direct
// read of the field at the cell it claims to be at.
{
  const probe = await latt.evaluate(async () => {
    const r = document.getElementById('stage').getBoundingClientRect();
    const hit = window.__lsProbe.at(r.left + r.width * 0.55, r.top + r.height * 0.5);
    if (!hit) return { error: 'the mapping returned nothing inside the stage' };
    window.__lsProbe.place(hit.coords);
    const st = window.__lsProbe.state();
    // What the field actually holds at that cell, read independently.
    const sim = window.__lsSim(), N = sim.lattice.cellCount;
    const mac = await sim.backend.snapshot('macro');
    const i = sim.lattice.index(...hit.coords);
    return { coords: hit.coords, cell: st.cell, expectCell: i,
      direct: { rho: mac[i], speed: Math.hypot(mac[N + i], mac[2 * N + i], mac[3 * N + i]) } };
  });
  check('lattsim: a screen point maps to the cell the probe reports',
    !probe.error && probe.cell === probe.expectCell, JSON.stringify(probe));

  // Now let it sample, and require the trace to match the field.
  // The probe records from the render loop, which is paused here, so drive it
  // explicitly rather than waiting for frames that are not coming.
  await latt.evaluate(async () => {
    for (let k = 0; k < 5; k++) { window.__lsStep(40); await window.__lsProbe.sample(); }
  });
  const agree = await latt.evaluate(async () => {
    const st = window.__lsProbe.state();
    const sim = window.__lsSim(), N = sim.lattice.cellCount;
    const mac = await sim.backend.snapshot('macro');
    const i = st.cell;
    return { probe: st.last, direct: { rho: mac[i],
      speed: Math.hypot(mac[N + i], mac[2 * N + i], mac[3 * N + i]) }, samples: st.samples };
  });
  const dRho = Math.abs(agree.probe.rho - agree.direct.rho);
  check('lattsim: the probe trace matches a direct read of that cell', dRho < 1e-3,
    JSON.stringify(agree));
  // Assert the TRACES, not just that a plot exists. Plotly puts js-plotly-plot
  // on the container itself rather than a child, and an empty plot has an svg
  // too -- so "there is a chart" would pass while the chart showed nothing.
  const chart = await latt.evaluate(() => ({
    isPlot: document.getElementById('probe-chart').classList.contains('js-plotly-plot'),
    traces: document.querySelectorAll('#probe-chart .scatterlayer .trace').length,
  }));
  check('lattsim: the probe chart is drawn with its traces',
    chart.isPlot && chart.traces >= 4, JSON.stringify(chart));

  // ---------------------------------------------------------- soft sensor
  // TWO POINTS, ONE MODEL: the probe is the sensor, and a second cell is the
  // target the model never measures. What is checked here is what only the
  // browser can check -- the wiring, the cadence and the chart's alignment.
  // The model itself is verified against a synthetic field in
  // test/probesense/sensor.test.mjs, where the right answer is known.
  // CONFIGURED FOR THE CLOCK, DELIBERATELY AND VISIBLY. Training 250 pairs at the
  // page's default resolution is ~9600 solver steps, which is eighteen minutes on
  // this software adapter -- and a check that slow does not get run, which is a
  // verification problem rather than an inconvenience. The smallest lattice, the
  // shortest lag window and the tightest sample interval reach the same 250 pairs
  // in ~2000 steps. None of it weakens what is being checked: the wiring, the
  // cadence and the alignment do not depend on how big the lattice is, and the
  // MODEL's accuracy is verified against a synthetic field in Node instead.
  await latt.selectOption('#scene', 'channel');
  await latt.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('res', 0); set('spf', 20);
    set('ss-lag', 2); set('ss-stride', 2); set('ss-every', 5); set('ss-lead', 6);
  });
  await latt.waitForFunction(() => window.__lsSim() && window.__lsSim().lattice.nx <= 80,
    null, { timeout: 180000 });
  const placed = await latt.evaluate(() => {
    const L = window.__lsSim().lattice;
    window.__lsProbe.place([Math.round(L.nx * 0.55), 1, L.nz >> 1]);
    window.__lsSS.place([Math.round(L.nx * 0.75), L.ny >> 1, L.nz >> 1]);
    return window.__lsSS.state();
  });
  check('lattsim: placing a target builds a soft sensor over both cells',
    placed && placed.cell >= 0 && placed.features > 0 && placed.depth > 1,
    JSON.stringify(placed && { cell: placed.cell, features: placed.features,
      depth: placed.depth, mode: placed.mode }));
  check('lattsim: the soft-sensor panel and chart become visible',
    await latt.evaluate(() => document.getElementById('ss-panel').classList.contains('on')
      && document.getElementById('ss-chart').classList.contains('on')));
  // THE LOCK IS GATED. Freezing an untrained readout deploys noise, and a user
  // who did that would read it as the method failing rather than as their own
  // mistake -- so the button refuses until there is something to lock.
  check('lattsim: estimation mode is refused until the model has trained',
    await latt.evaluate(() => document.getElementById('ss-lock').disabled));

  // Drive the real frame loop: the cadence logic lives there, so stepping the
  // solver by hand would test everything except the thing that could be wrong.
  await latt.evaluate(() => { window.__lsSS.train(); });
  await latt.click('#run');
  await latt.waitForFunction(() => {
    const st = window.__lsSS.state();
    return st && st.trained > 250;
  }, null, { timeout: 240000 });
  await latt.click('#run');
  const ran = await latt.evaluate(() => window.__lsSS.state());

  // THE CADENCE IS EXACT, and this is the check that earns the split-step loop.
  // A model's lag window is counted in samples, so if the sample interval drifted
  // with the steps-per-frame slider the window would span a different amount of
  // time at every slider position -- a viewing control changing what the model
  // learns. The loop stops the solver exactly on each boundary; misses count any
  // time it could not.
  check('lattsim: the soft sensor samples on exact solver-step boundaries',
    ran.misses === 0, `${ran.misses} missed boundaries over ${ran.samples} samples`);
  check('lattsim: training accumulated pairs from the live loop',
    ran.trained > 250 && ran.estimate.n > 250,
    JSON.stringify({ trained: ran.trained, graded: ran.estimate.n }));
  // The prediction can only be graded once its target has ARRIVED, so a non-zero
  // count here is evidence the horizon pairing actually matured rather than being
  // scored against the present.
  check('lattsim: the prediction was graded against arrived targets',
    ran.predict.n > 100, JSON.stringify({ n: ran.predict.n, nrmse: ran.predict.nrmse }));
  // The forecast is stamped exactly one lead ahead of the last sample. This is the
  // property the chart's alignment rests on: drawn at the step it is ABOUT, a
  // correct forecast lies on the truth, and drawn where it was ISSUED it would
  // appear shifted by the whole lead and a perfect forecast would look wrong.
  const lead = await latt.evaluate(() => {
    // FORCE A REDRAW FIRST. The chart is drawn once per frame, so reading a chart
    // value and a model value together races the renderer: measured a 15-step gap,
    // exactly three samples at this cadence, which looks like a broken forecast
    // stamp and is really just a chart three samples behind. Comparing a rendered
    // value against a live one always needs the render to be current.
    window.__lsSS.draw();
    const st = window.__lsSS.state();
    const el = document.getElementById('ss-chart');
    const truth = el.data.find((t) => t.name === 'truth');
    const early = el.data.find((t) => t.name === 'predicted earlier');
    return { live: st.live, every: st.every, leadSamples: +document.getElementById('ss-lead').value,
      lastTruth: truth.x[truth.x.length - 1],
      earlyLast: early.x[early.x.length - 1], earlyN: early.x.length,
      traces: el.data.length, isPlot: el.classList.contains('js-plotly-plot') };
  });
  check('lattsim: the live forecast is stamped one lead ahead of the last sample',
    lead.live && lead.live.step === lead.lastTruth + lead.leadSamples * lead.every,
    JSON.stringify(lead));
  check('lattsim: the matured prediction is drawn at the step it is about, not when issued',
    lead.earlyN > 100 && lead.earlyLast <= lead.lastTruth
    && lead.earlyLast > lead.lastTruth - 3 * lead.every, JSON.stringify(lead));
  check('lattsim: the soft-sensor chart carries every series',
    lead.isPlot && lead.traces >= 4, JSON.stringify(lead));

  // A trained model beating a scaled reading of its own sensor is the whole claim.
  // Asserted loosely -- the flow depends on the scene and the settings -- but a
  // ratio below 1 would mean the model is worse than a calibration constant.
  check('lattsim: the soft sensor beats a scaled sensor reading',
    ran.estimate.ratio > 1.2,
    `${ran.estimate.nrmse} vs ${ran.estimate.baseline} (x${ran.estimate.ratio})`);

  // ------------------------------------------------------- the slider stops
  // THE RANGES REACH PAST WHAT THE SOLVER CAN SOLVE, ON PURPOSE, so the guarantee
  // that matters is that it stays FINITE and says what it is doing. Re_cell 10500
  // is 52x past the range the sub-grid model was measured over; the limiter catches
  // a NaN in the cell where it appears and replaces it with the equilibrium at
  // sanitised moments, so it can never stream to a neighbour. Asserted rather than
  // assumed, because "clamps" and "goes non-finite and freezes" are the two
  // outcomes this whole mechanism exists to separate.
  await latt.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('tau', 0.5001); set('uin', 0.35);
  });
  // A SIMULATION OBJECT EXISTS BEFORE IT IS BUILT, so "not null" is not the
  // condition to wait on -- `advance()` throws "call build() first" until the
  // solver is attached, and two slider changes queue two rebuilds so there is a
  // window where neither holds. Wait for the SOLVER, and wrap the whole probe:
  // a check that THROWS takes every later check in the run with it, which is
  // strictly worse than one that fails. The first two versions of this crashed
  // the suite and hid everything downstream both times.
  const stops = await latt.evaluate(async () => {
    try {
      const ready = () => { const sim = window.__lsSim(); return !!(sim && sim.solver); };
      for (let i = 0; i < 240 && !ready(); i++) await new Promise((r) => setTimeout(r, 250));
      if (!ready()) return { error: 'no built simulation after 60s' };
      window.__lsStep(1200);
      const d = await window.__lsDiag();
      if (!d) return { error: 'no diagnostics' };
      return { uMax: d.uMax, rho: [d.rhoMin, d.rhoMax], limited: d.limited,
        cells: window.__lsSim().lattice.cellCount, state: d.stable.state,
        risk: document.getElementById('s-risk').textContent,
        mach: document.getElementById('s-mach').textContent };
    } catch (e) { return { error: String((e && e.message) || e) }; }
  });
  // ----------------------------------------------------- equation of state
  // THE EOS PRESSURE FORCE ON THE WGSL BACKEND, verified the way the CPU
  // reference is: a stiffer fluid propagates sound FASTER. Seed a standing
  // acoustic wave, measure its period at an antinode, and check the sound speed
  // shifts from the lattice cs (0.577) to the EOS value (0.80). This is the ONLY
  // check that exercises the force on the GPU -- a uniform-density flow has zero
  // pressure gradient, so it would pass trivially whether the force worked or not.
  const eosSound = await latt.evaluate(async () => {
    const { Simulation } = await import(new URL('./lib/lattsim/simulation.js', location.href).href);
    const { LBMFluidOperator } = await import(new URL('./lib/lattsim/operators/lbm.js', location.href).href);
    const { TOPOLOGY } = await import(new URL('./lib/lattsim/lattice.js', location.href).href);
    const { feq } = await import(new URL('./lib/lattsim/d3q19.js', location.href).href);
    async function c(eos, soundSpeed) {
      const Nx = 64, Ny = 4, Nz = 4, eps = 1e-3, N = Nx * Ny * Nz;
      const sim = new Simulation({ lattice: { size: [Nx, Ny, Nz], spacing: 1e-3,
        topology: [TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC] } });
      sim.addPhysics(new LBMFluidOperator({ tau: 0.6, collision: 'bgk', eos, soundSpeed }));
      await sim.build({ backend: 'webgpu' });
      if (sim.backend.kind !== 'webgpu') return null;   // no GPU here -> skip, not fail
      const buf = new Float32Array(19 * N);
      for (let x = 0; x < Nx; x++) for (let y = 0; y < Ny; y++) for (let z = 0; z < Nz; z++) {
        const i = x + Nx * (y + Ny * z), rho = 1 + eps * Math.cos(2 * Math.PI * x / Nx);
        for (let q = 0; q < 19; q++) buf[q * N + i] = feq(q, rho, 0, 0, 0);
      }
      sim.backend.device.queue.writeBuffer(sim.backend.read('f'), 0, buf);
      const probe = 0 + Nx * (2 + Ny * 2), series = [];
      for (let t = 0; t < 400; t++) { const v = await sim.backend.probe('macro', probe); series.push(v[0] - 1); sim.advance(1); }
      await sim.backend.destroy();
      const cr = [];
      for (let t = 1; t < series.length; t++) if ((series[t - 1] >= 0) !== (series[t] >= 0)) cr.push(t - 1 + series[t - 1] / (series[t - 1] - series[t]));
      return cr.length >= 2 ? Nx / (2 * (cr[1] - cr[0])) : NaN;
    }
    return { ideal: await c('ideal', null), stiff: await c('linear', 0.80) };
  });
  if (eosSound && eosSound.ideal != null) {
    check('lattsim: the ideal EOS propagates sound at the lattice cs on the GPU',
      Math.abs(eosSound.ideal - Math.sqrt(1 / 3)) / Math.sqrt(1 / 3) < 0.03, eosSound.ideal);
    check('lattsim: a stiffer EOS raises the GPU sound speed to its set value',
      Math.abs(eosSound.stiff - 0.80) / 0.80 < 0.03, eosSound.stiff);
  } else {
    check('lattsim: EOS sound-speed check skipped (no GPU here)', true);
  }

  check('lattsim: the extreme corner of the sliders stays finite',
    stops && !stops.error && Number.isFinite(stops.uMax) && Number.isFinite(stops.rho[0])
    && Number.isFinite(stops.rho[1]), JSON.stringify(stops));
  // It MUST be limited there -- if nothing clamped, either the corner is no longer
  // extreme or the limiter stopped working, and both need to be noticed.
  check('lattsim: and reports that it is being held up rather than solved',
    stops && stops.limited > 0 && stops.state === 'limited',
    stops ? `${stops.limited} of ${stops.cells} cells, verdict ${stops.state}` : 'no diagnostics');
  // Mach and Re_cell are INDEPENDENT failures, and the readout has to name both.
  // Measured: at tau 2.5 the flow is viscous (Re_cell 0.5, safe by the Reynolds
  // criterion) and still clamps, purely from compressibility.
  check('lattsim: the risk rows name both the Reynolds and the Mach failure',
    stops && /far past the measured range/.test(stops.risk)
    && /compressibility error/.test(stops.mach),
    stops ? stops.risk + ' | ' + stops.mach : 'no diagnostics');

  const lockedMode = await latt.evaluate(() => {
    const before = window.__lsSS.state().trained;
    window.__lsSS.lock();
    return { mode: window.__lsSS.state().mode, before };
  });
  check('lattsim: locking switches to estimation mode', lockedMode.mode === 'estimating',
    JSON.stringify(lockedMode));
  await latt.screenshot({ path: join(SHOTS, '11-lattsim-softsensor.png') });
}

// The Architecture tab is where the engine states what it is and is not.
await latt.click('.tab[data-tab="about"]');
await latt.waitForTimeout(200);
check('lattsim: architecture tab explains the two backends',
  /CPU reference/.test(await latt.textContent('#p-about')));
await latt.screenshot({ path: join(SHOTS, '10-lattsim-arch.png') });

// THE PAGE'S OWN ERROR BUFFER, in both tiers. Neither Playwright's `pageerror`
// nor the console listener reports unhandled rejections, so the two checks below
// can pass while the live page shows a red error badge -- which is exactly what
// happened once already, and was only noticed in a screenshot. This reads the
// same instrument the phone shows the owner.
const ownErrors = await latt.evaluate(() =>
  window.__dbg.buffer().filter((e) => e.type === 'error').map((e) => String(e.text).slice(0, 300)));
check('lattsim: the page reports no errors of its own (badge clear)',
  ownErrors.length === 0, ownErrors.join(' | '));
check('lattsim: no errors overall', lattErrors.length === 0, lattErrors.join(' | '));
check('lattsim: nothing logged to console.error', lattConsole.length === 0, lattConsole.join(' | '));

// ---- THE 3D VIEW MUST SURVIVE A REBUILD.
//
// The volume renderer is bound to a simulation, so a rebuild destroys it -- and
// it was only ever recreated by the view selector's change handler. Pressing
// Reset in 3D therefore left it null and drawOnce() returned early: a dead view,
// no error, no way back except toggling the selector. Invisible before v114
// only because every build used to reset the view to the 2D slice.
//
// RUN LAST AND ON ITS OWN PAGE, DELIBERATELY. Entering this view here calls
// getCurrentTexture() on a software adapter, which does not merely fail -- it
// destroys the WebGPU instance, and every compute call after it fails too. That
// is why the rest of the suite never switches to it. Isolating it to a
// throwaway page at the very end keeps the blast radius to itself.
//
// The PICTURE is still unverifiable here and is checked on a real device. What
// IS checked is the LIFECYCLE, which is where the bug actually was: after a
// rebuild the page must either hold a live renderer or have fallen back to the
// slice -- never sit in 3D with nothing to draw with.
if (FULL) {
  const v3d = await ctx.newPage();
  try {
    await v3d.goto(BASE.replace(/index\.html$/, '') + 'lattsim.html', { waitUntil: 'networkidle' });
    await v3d.waitForFunction(() => window.__lsDbg && !window.__lsDbg().building && window.__lsDbg().cells > 0,
      null, { timeout: 120000 });
    const has3D = await v3d.evaluate(() =>
      [...document.getElementById('view').options].some((o) => o.value === 'volume'));
    if (has3D) {
      await v3d.selectOption('#view', 'volume');
      await v3d.waitForTimeout(800);
      await v3d.click('#reset');
      await v3d.waitForFunction(() => !window.__lsDbg().building, null, { timeout: 120000 });
      await v3d.waitForTimeout(600);
      const st = await v3d.evaluate(() => window.__lsDbg());
      check('lattsim: after a rebuild the 3D view has a renderer or has fallen back to the slice',
        st.view !== 'volume' || st.rendererReady,
        JSON.stringify({ view: st.view, rendererReady: st.rendererReady }));
    } else {
      console.log('  (3D view not offered here — nothing to check)');
    }
  } catch (e) {
    check('lattsim: the 3D lifecycle check ran', false, String(e).slice(0, 200));
  }
  await v3d.close().catch(() => {});
}

await browser.close();

section('end');
console.log('\nSection timings (s):');
for (const [n, ms] of timings.filter((t) => t[1] > 400)) console.log(`  ${String(Math.round(ms / 1000)).padStart(5)}  ${n}`);
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} check(s) failed. Screenshots in test/screenshots/\n`);
process.exit(failed === 0 ? 0 : 1);
