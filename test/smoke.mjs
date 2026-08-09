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

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}

mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({
  executablePath: findChrome(),
  // SwiftShader so the WebGL (three.js) NGRC demo renders headless
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
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
await page.click('#dbg-close');
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
const demoBase = BASE.replace(/index\.html$/, '') + 'ngrc.html';
const demo = await ctx.newPage();
const demoErrors = [];
demo.on('pageerror', e => demoErrors.push(String(e)));
demo.on('console', m => { if (m.type() === 'error') demoErrors.push('console.error: ' + m.text()); });
await demo.goto(demoBase, { waitUntil: 'networkidle' });
await demo.waitForTimeout(2500);
check('ngrc.html loads with no errors', demoErrors.length === 0, demoErrors.join(' | '));
const three = await demo.evaluate(() => !!(window.THREE || document.querySelector('#lz-stage canvas')));
check('ngrc: WebGL/three canvas present', three);
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

// ---- tab 4: anti-slosh axis ----
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

await browser.close();

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} check(s) failed. Screenshots in test/screenshots/\n`);
process.exit(failed === 0 ? 0 : 1);
